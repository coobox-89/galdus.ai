"""Write the OpenAPI document to a file: python -m app.openapi_export ../../docs/api/openapi.json

The interactive docs (/docs) are off in production, so the generated document is committed and CI
checks it is current.
"""
import json
import sys

from .main import app


def main(path: str) -> None:
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(app.openapi(), fh, indent=2, sort_keys=True, ensure_ascii=False)
        fh.write("\n")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "openapi.json")
