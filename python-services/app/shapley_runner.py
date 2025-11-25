# python-service/app/shapley_runner.py
import sys
import json
from app.model_runner import GNNWrapper
import pandas as pd

def main():
    # read JSON from stdin or sys.argv[1]
    if not sys.stdin.isatty():
        input_json = sys.stdin.read()
    elif len(sys.argv) > 1:
        input_json = sys.argv[1]
    else:
        print(json.dumps({"error": "no input"}))
        sys.exit(1)

    try:
        req = json.loads(input_json)
        target = req.get("target_country")
        params = req.get("params", {})
    except Exception as e:
        print(json.dumps({"error": f"invalid input: {str(e)}"}))
        sys.exit(2)

    runner = GNNWrapper(device='cpu')  # or GPU if available
    allocations = runner.run_shapley(target, params)
    print(json.dumps({"allocations": allocations}))
    sys.stdout.flush()

if __name__ == "__main__":
    main()
