import json
import logging
import os
from functools import wraps
from urllib.request import urlopen

from flask import request
from jose import jwt

AUTH0_DOMAIN = os.getenv('AUTH0_DOMAIN')
ALGORITHMS = os.getenv('ALGORITHMS', 'RS256')
API_AUDIENCE = os.getenv('API_AUDIENCE')
CLIENT_ID = os.getenv('CLIENT_ID')

IS_AUTH0_CONFIGURED = bool(AUTH0_DOMAIN and API_AUDIENCE)
ALLOW_DEMO_AUTH = (
    os.getenv('ALLOW_DEMO_AUTH', 'false' if IS_AUTH0_CONFIGURED else 'true')
    .lower()
    == 'true'
)

ROLE_PERMISSIONS = {
    'casting_assistant': [
        'get:actors',
        'get:movies',
    ],
    'casting_director': [
        'get:actors',
        'get:movies',
        'post:actors',
        'patch:actors',
        'delete:actors',
        'patch:movies',
    ],
    'executive_producer': [
        'get:actors',
        'get:movies',
        'post:actors',
        'patch:actors',
        'delete:actors',
        'post:movies',
        'patch:movies',
        'delete:movies',
    ],
}

logging.basicConfig(
    filename='error.log',
    level=logging.INFO,
    format='%(asctime)s %(levelname)s: %(message)s',
)


class AuthError(Exception):
    """Standardized authentication and authorization error."""

    def __init__(self, error, status_code):
        self.error = error
        self.status_code = status_code


def get_token_auth_header():
    """Extract the Bearer token from the Authorization header."""
    auth = request.headers.get('Authorization', None)
    if not auth:
        logging.info('Authorization header is missing')
        raise AuthError(
            {
                'code': 'authorization_header_missing',
                'description': 'Authorization header is expected.',
            },
            401,
        )

    parts = auth.split()
    if parts[0].lower() != 'bearer':
        logging.info('invalid_header, Authorization header must start with Bearer')
        raise AuthError(
            {
                'code': 'invalid_header',
                'description': 'Authorization header must start with "Bearer".',
            },
            401,
        )
    if len(parts) == 1:
        logging.info('invalid_header, Token not found')
        raise AuthError(
            {
                'code': 'invalid_header',
                'description': 'Token not found.',
            },
            401,
        )
    if len(parts) > 2:
        logging.info('invalid_header, Authorization header must be bearer token')
        raise AuthError(
            {
                'code': 'invalid_header',
                'description': 'Authorization header must be bearer token.',
            },
            401,
        )
    return parts[1]


def check_permissions(permission, payload):
    """Verify that the required permission is present in the JWT payload."""
    if 'permissions' not in payload:
        logging.info('invalid_claims, Permissions not included in JWT.')
        raise AuthError(
            {
                'code': 'invalid_claims',
                'description': 'Permissions not included in JWT.',
            },
            400,
        )

    if permission not in payload['permissions']:
        logging.info('unauthorized, Permission %s not found.', permission)
        raise AuthError(
            {
                'code': 'unauthorized',
                'description': f'Permission "{permission}" is required for this action.',
            },
            403,
        )
    return True


def verify_demo_token(token):
    """Decode local studio demo tokens when demo auth is enabled."""
    if not token.startswith('demo:'):
        return None
    if not ALLOW_DEMO_AUTH:
        raise AuthError(
            {
                'code': 'demo_auth_disabled',
                'description': 'Demo authentication is disabled when Auth0 is active.',
            },
            401,
        )
    role = token.split(':', 1)[1].strip()
    if role not in ROLE_PERMISSIONS:
        raise AuthError(
            {
                'code': 'invalid_demo_role',
                'description': f'Unknown studio role "{role}".',
            },
            401,
        )
    return {
        'sub': f'demo|{role}',
        'role': role,
        'permissions': ROLE_PERMISSIONS[role],
    }


def verify_decode_jwt(token):
    """Verify and decode either a demo studio token or an Auth0 RS256 JWT."""
    demo_payload = verify_demo_token(token)
    if demo_payload is not None:
        return demo_payload

    if not IS_AUTH0_CONFIGURED:
        raise AuthError(
            {
                'code': 'auth0_not_configured',
                'description': (
                    'Auth0 environment variables are not configured. '
                    'Switch to Local Studio Mode or configure AUTH0_DOMAIN and API_AUDIENCE.'
                ),
            },
            401,
        )

    jsonurl = urlopen(f'https://{AUTH0_DOMAIN}/.well-known/jwks.json')
    jwks = json.loads(jsonurl.read())
    unverified_header = jwt.get_unverified_header(token)
    rsa_key = {}
    if 'kid' not in unverified_header:
        logging.info('invalid_header, Authorization malformed')
        raise AuthError(
            {
                'code': 'invalid_header',
                'description': 'Authorization malformed.',
            },
            401,
        )
    for key in jwks['keys']:
        if key['kid'] == unverified_header['kid']:
            rsa_key = {
                'kty': key['kty'],
                'kid': key['kid'],
                'use': key['use'],
                'n': key['n'],
                'e': key['e'],
            }
    if rsa_key:
        try:
            algorithms = (
                ALGORITHMS
                if isinstance(ALGORITHMS, list)
                else [a.strip() for a in ALGORITHMS.strip('[]').replace("'", '').split(',') if a.strip()]
            )
            payload = jwt.decode(
                token,
                rsa_key,
                algorithms=algorithms,
                audience=API_AUDIENCE,
                issuer='https://' + AUTH0_DOMAIN + '/',
            )
            return payload
        except jwt.ExpiredSignatureError:
            logging.info('Token expired')
            raise AuthError(
                {
                    'code': 'token_expired',
                    'description': 'Token expired.',
                },
                401,
            )
        except jwt.JWTClaimsError:
            logging.info('invalid_claims, Incorrect claims.')
            raise AuthError(
                {
                    'code': 'invalid_claims',
                    'description': 'Incorrect claims. Please check the audience and issuer.',
                },
                401,
            )
        except Exception:
            logging.error('invalid_header, Unable to parse authentication token.', exc_info=True)
            raise AuthError(
                {
                    'code': 'invalid_header',
                    'description': 'Unable to parse authentication token.',
                },
                400,
            )

    logging.info('invalid_header, Unable to find the appropriate key.')
    raise AuthError(
        {
            'code': 'invalid_header',
            'description': 'Unable to find the appropriate key.',
        },
        400,
    )


def requires_auth(permission=''):
    """Decorator to enforce authentication and RBAC permission checks."""

    def requires_auth_decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            token = get_token_auth_header()
            try:
                payload = verify_decode_jwt(token)
            except AuthError:
                raise
            except Exception:
                raise AuthError(
                    {
                        'code': 'invalid_token',
                        'description': 'Unable to verify authentication token.',
                    },
                    401,
                )
            if permission:
                check_permissions(permission, payload)
            return f(payload, *args, **kwargs)

        return wrapper

    return requires_auth_decorator
