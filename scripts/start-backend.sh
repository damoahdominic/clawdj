#!/bin/bash
cd "$(dirname "$0")/../backend"
exec sg docker -c "../venv/bin/python3 -m uvicorn main:app --host 0.0.0.0 --port 8004"
