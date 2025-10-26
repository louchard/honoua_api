import sys, os
# S'assurer que /app (racine du projet dans le conteneur) est dans le PYTHONPATH
if "/app" not in sys.path:
    sys.path.insert(0, "/app")

from app.security.jwt_utils import encode_jwt
t, j, e = encode_jwt("demo-user")
print(t)
