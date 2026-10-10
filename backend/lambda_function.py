import json
import os
from pathlib import Path


RESULTS = Path(__file__).resolve().parents[1] / ".generated" / "results.json"


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {"content-type": "application/json"},
        "body": json.dumps(body),
    }


def load_results(basin_id, profile_id):
    bucket = os.environ.get("RESULTS_BUCKET")
    if not bucket:
        return json.loads(RESULTS.read_text(encoding="utf-8"))

    import boto3
    from botocore.exceptions import ClientError

    try:
        result = boto3.client("s3").get_object(
            Bucket=bucket,
            Key=f"{basin_id}/{profile_id}.json",
        )
    except ClientError as error:
        if error.response.get("Error", {}).get("Code") in ("NoSuchKey", "NoSuchBucket", "404"):
            raise FileNotFoundError from error
        raise RuntimeError("The SWMM result object could not be read.") from error
    return json.loads(result["Body"].read())


def handler(event, _context):
    method = event.get("requestContext", {}).get("http", {}).get("method", "GET")
    if method != "GET":
        return response(405, {"message": "Use GET for this scenario lookup."})

    params = event.get("queryStringParameters") or {}
    basin_id = params.get("basin")
    if basin_id != "barapullah":
        return response(400, {"message": "Basin must be barapullah."})
    try:
        crew_limit = int(params.get("crewLimit", "1"))
    except (TypeError, ValueError):
        return response(400, {"message": "Crew limit must be 1, 2, or 3."})
    if crew_limit not in (1, 2, 3):
        return response(400, {"message": "Crew limit must be 1, 2, or 3."})
    profile_id = params.get("rainfallProfile", "heavy")
    if profile_id not in ("moderate", "heavy", "extreme"):
        return response(400, {"message": "Rainfall profile must be moderate, heavy, or extreme."})

    try:
        results = load_results(basin_id, profile_id)
    except FileNotFoundError:
        return response(503, {
            "message": "Precomputed SWMM results are missing for this basin and rainfall profile.",
        })
    except (OSError, json.JSONDecodeError, RuntimeError):
        return response(500, {"message": "The SWMM result bundle could not be read."})

    scenario = results.get("scenarios", {}).get(profile_id, results)
    if scenario.get("rainfallProfile", {}).get("id") != profile_id:
        scenario = None
    if not scenario:
        return response(500, {"message": "The SWMM result bundle is incomplete."})
    plans = scenario.get("plansByCrewLimit", {}).get(str(crew_limit))
    if plans is None:
        return response(500, {"message": "The SWMM result bundle is incomplete."})
    return response(200, {
        **results["metadata"],
        "rainfallProfile": scenario["rainfallProfile"],
        "crewLimit": crew_limit,
        "plans": plans,
    })
