"""Routers package — explicit exports for import compatibility.

Allows:
    from app.routers import products
    from app.routers import compare
    from app.routers import tokens
"""
from . import products  # exposes products module as app.routers.products
from . import compare   # exposes compare module as app.routers.compare
from . import tokens    # exposes tokens module as app.routers.tokens
