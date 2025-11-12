import logging

logger = logging.getLogger("honoua")
if not logger.handlers:
    logger.setLevel(logging.INFO)
    handler = logging.StreamHandler()
    formatter = logging.Formatter("%(asctime)s | %(levelname)s | honoua | %(message)s")
    handler.setFormatter(formatter)
    logger.addHandler(handler)
