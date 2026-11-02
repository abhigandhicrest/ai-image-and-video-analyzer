"""AWS Rekognition calls using image bytes. Images are not uploaded to S3."""

import logging

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError, EndpointConnectionError, NoCredentialsError

from app.config.settings import get_settings

logger = logging.getLogger(__name__)

# Cached boto3 client. Built on the first Rekognition call.
_client = None

# Public messages for known AWS error codes. Unknown codes use a generic line.
_ERROR_MESSAGES = {
    "InvalidImageFormatException": "AWS Rekognition could not read this image format.",
    "ImageTooLargeException": "The image is too large for AWS Rekognition.",
    "InvalidParameterException": "AWS Rekognition rejected the image.",
    "AccessDeniedException": "The AWS credentials do not have permission to use Rekognition.",
    "UnrecognizedClientException": "AWS rejected the access key. Check AWS_ACCESS_KEY_ID.",
    "InvalidSignatureException": "AWS rejected the secret key. Check AWS_SECRET_ACCESS_KEY.",
    "SignatureDoesNotMatch": "AWS rejected the secret key. Check AWS_SECRET_ACCESS_KEY.",
    "ExpiredTokenException": "The AWS session token has expired.",
    "ProvisionedThroughputExceededException": "AWS Rekognition is throttling requests. Try again shortly.",
    "ThrottlingException": "AWS Rekognition is throttling requests. Try again shortly.",
    "InternalServerError": "AWS Rekognition returned a server error. Try again shortly.",
}


class RekognitionError(Exception):
    """A Rekognition failure the API can show to the user without a stack trace."""

    def __init__(self, message: str, code: str) -> None:
        self.message = message
        self.code = code
        super().__init__(message)


def get_rekognition_client():
    """Return a shared Rekognition client for the configured region.

    Explicit keys are passed only when both are set. Otherwise boto3 uses
    the default credential chain.
    """
    global _client
    if _client is None:
        settings = get_settings()
        kwargs = {
            "region_name": settings.aws_region,
            "config": Config(
                connect_timeout=5,
                read_timeout=30,
                retries={"max_attempts": 2, "mode": "standard"},
            ),
        }
        if settings.aws_credentials_configured:
            kwargs["aws_access_key_id"] = settings.aws_access_key_id
            kwargs["aws_secret_access_key"] = settings.aws_secret_access_key
        _client = boto3.client("rekognition", **kwargs)
    return _client


def _round(value, places: int = 2):
    """Round a numeric AWS value, or return None when the field is missing."""
    if value is None:
        return None
    return round(float(value), places)


def _box(box: dict | None) -> dict | None:
    """Convert a Rekognition bounding box to left/top/width/height fractions.

    Values are relative to the image (0 to 1), not pixels.
    """
    if not box:
        return None
    return {
        "width": _round(box.get("Width", 0), 4),
        "height": _round(box.get("Height", 0), 4),
        "left": _round(box.get("Left", 0), 4),
        "top": _round(box.get("Top", 0), 4),
    }


def _bool_attr(attr: dict | None) -> dict | None:
    """Normalize a yes/no face attribute such as Smile or Beard."""
    if not attr:
        return None
    return {"value": bool(attr.get("Value")), "confidence": _round(attr.get("Confidence"))}


def _value_attr(attr: dict | None) -> dict | None:
    """Normalize a labeled face attribute such as Gender."""
    if not attr:
        return None
    return {"value": attr.get("Value"), "confidence": _round(attr.get("Confidence"))}


def _invoke(operation: str, **kwargs) -> dict:
    """Call one Rekognition operation and translate AWS errors into RekognitionError.

    Logs keep the error class only. Request details and credentials are not logged.
    """
    try:
        client = get_rekognition_client()
        return getattr(client, operation)(**kwargs)
    except NoCredentialsError as exc:
        logger.error("Rekognition %s failed (NoCredentialsError)", operation)
        raise RekognitionError(
            "AWS credentials are not configured on the server. Add them to backend/.env and restart the API.",
            "NoCredentialsError",
        ) from exc
    except EndpointConnectionError as exc:
        logger.error("Rekognition %s failed (EndpointConnectionError)", operation)
        raise RekognitionError(
            "Could not reach AWS Rekognition. Check AWS_REGION and network access.",
            "EndpointConnectionError",
        ) from exc
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "ClientError")
        logger.error("Rekognition %s failed (%s)", operation, code)
        raise RekognitionError(
            _ERROR_MESSAGES.get(code, "AWS Rekognition could not complete this request."),
            code,
        ) from exc
    except BotoCoreError as exc:
        logger.error("Rekognition %s failed (%s)", operation, exc.__class__.__name__)
        raise RekognitionError(
            "Could not communicate with AWS Rekognition.",
            exc.__class__.__name__,
        ) from exc


# Name and parent tokens used to sort DetectLabels results into four groups.
_ANIMAL_TOKENS = {
    "animal",
    "mammal",
    "bird",
    "fish",
    "reptile",
    "amphibian",
    "insect",
    "pet",
    "wildlife",
    "invertebrate",
    "sea life",
    "arachnid",
}
_VEHICLE_TOKENS = {
    "vehicle",
    "car",
    "truck",
    "bus",
    "motorcycle",
    "bicycle",
    "bike",
    "aircraft",
    "airplane",
    "boat",
    "ship",
    "train",
    "transportation",
    "suv",
    "van",
    "scooter",
}
_OTHER_TOKENS = {"person", "people", "human", "crowd", "text", "symbol"}


def classify_label(name: str, parents: list[str], categories: list[str], instance_count: int = 0) -> str:
    """Map a Rekognition label to animal, vehicle, object, or other.

    Category text is checked first, then parent and name tokens. A label with
    a located instance and no better match is treated as an object.
    """
    category_text = " ".join(categories).lower()
    tokens = {name.lower(), *(parent.lower() for parent in parents)}

    if "animal" in category_text or "pet" in category_text or tokens & _ANIMAL_TOKENS:
        return "animal"
    if (
        "vehicle" in category_text
        or "automotive" in category_text
        or "transport" in category_text
        or tokens & _VEHICLE_TOKENS
    ):
        return "vehicle"
    if tokens & _OTHER_TOKENS or any(
        hint in category_text
        for hint in ("person", "color", "visual composition", "text", "document", "symbol", "flag", "building", "architecture", "nature", "outdoor", "plant", "flower")
    ):
        return "other"
    if any(
        hint in category_text
        for hint in ("object", "apparel", "kitchen", "food", "beverage", "technology", "computing", "weapon", "sport", "tool", "furniture", "home", "musical", "beauty", "medical")
    ):
        return "object"
    if instance_count > 0:
        return "object"
    return "other"


def parse_labels(response: dict) -> dict:
    """Flatten DetectLabels into sorted labels plus a count for each group."""
    labels = []
    groups = {"animal": 0, "vehicle": 0, "object": 0, "other": 0}
    for label in response.get("Labels", []):
        instances = []
        for instance in label.get("Instances", []):
            instances.append(
                {
                    "confidence": _round(instance.get("Confidence")),
                    "bounding_box": _box(instance.get("BoundingBox")),
                }
            )
        parents = [parent.get("Name") for parent in label.get("Parents", []) if parent.get("Name")]
        categories = [category.get("Name") for category in label.get("Categories", []) if category.get("Name")]
        kind = classify_label(label.get("Name") or "Unknown", parents, categories, len(instances))
        groups[kind] += 1
        labels.append(
            {
                "name": label.get("Name") or "Unknown",
                "confidence": _round(label.get("Confidence")),
                "parents": parents,
                "categories": categories,
                "kind": kind,
                "instance_count": len(instances),
                "instances": instances,
            }
        )
    labels.sort(key=lambda item: item["confidence"] or 0, reverse=True)
    return {"label_count": len(labels), "groups": groups, "labels": labels}


def detect_labels(image_bytes: bytes, min_confidence: float = 50.0) -> dict:
    """Call DetectLabels and return the parsed label groups."""
    response = _invoke(
        "detect_labels",
        Image={"Bytes": image_bytes},
        MaxLabels=50,
        MinConfidence=float(min_confidence),
    )
    return parse_labels(response)


def parse_faces(response: dict) -> dict:
    """Flatten DetectFaces details, with emotions ordered by confidence."""
    faces = []
    for face in response.get("FaceDetails", []):
        age = face.get("AgeRange") or {}
        pose = face.get("Pose") or {}
        quality = face.get("Quality") or {}
        emotions = [
            {"type": emotion.get("Type"), "confidence": _round(emotion.get("Confidence"))}
            for emotion in face.get("Emotions", [])
        ]
        emotions.sort(key=lambda item: item["confidence"] or 0, reverse=True)
        landmarks = [
            {
                "type": landmark.get("Type"),
                "x": _round(landmark.get("X"), 4),
                "y": _round(landmark.get("Y"), 4),
            }
            for landmark in face.get("Landmarks", [])
        ]
        faces.append(
            {
                "confidence": _round(face.get("Confidence")),
                "bounding_box": _box(face.get("BoundingBox")),
                "age_range": {
                    "low": int(age["Low"]) if age.get("Low") is not None else None,
                    "high": int(age["High"]) if age.get("High") is not None else None,
                },
                "gender": _value_attr(face.get("Gender")),
                "smile": _bool_attr(face.get("Smile")),
                "eyeglasses": _bool_attr(face.get("Eyeglasses")),
                "sunglasses": _bool_attr(face.get("Sunglasses")),
                "beard": _bool_attr(face.get("Beard")),
                "mustache": _bool_attr(face.get("Mustache")),
                "eyes_open": _bool_attr(face.get("EyesOpen")),
                "mouth_open": _bool_attr(face.get("MouthOpen")),
                "emotions": emotions,
                "pose": {
                    "roll": _round(pose.get("Roll")),
                    "yaw": _round(pose.get("Yaw")),
                    "pitch": _round(pose.get("Pitch")),
                },
                "quality": {
                    "brightness": _round(quality.get("Brightness")),
                    "sharpness": _round(quality.get("Sharpness")),
                },
                "landmarks": landmarks,
            }
        )
    return {"face_count": len(faces), "faces": faces}


def detect_faces(image_bytes: bytes) -> dict:
    """Call DetectFaces with every attribute and return the parsed faces."""
    response = _invoke(
        "detect_faces",
        Image={"Bytes": image_bytes},
        Attributes=["ALL"],
    )
    return parse_faces(response)


def parse_text(response: dict) -> dict:
    """Split DetectText items into lines and words, ordered top-to-bottom then left-to-right."""
    lines = []
    words = []
    for item in response.get("TextDetections", []):
        entry = {
            "text": item.get("DetectedText") or "",
            "confidence": _round(item.get("Confidence")),
            "type": item.get("Type"),
            "id": item.get("Id"),
            "parent_id": item.get("ParentId"),
            "bounding_box": _box((item.get("Geometry") or {}).get("BoundingBox")),
        }
        if item.get("Type") == "LINE":
            lines.append(entry)
        elif item.get("Type") == "WORD":
            words.append(entry)

    def _position(entry: dict) -> tuple[float, float]:
        box = entry.get("bounding_box") or {}
        return (box.get("top") or 0, box.get("left") or 0)

    lines.sort(key=_position)
    words.sort(key=_position)
    return {
        "line_count": len(lines),
        "word_count": len(words),
        "full_text": "\n".join(line["text"] for line in lines if line["text"]),
        "lines": lines,
        "words": words,
    }


def detect_text(image_bytes: bytes) -> dict:
    """Call DetectText and return lines, words, and the joined transcript."""
    response = _invoke("detect_text", Image={"Bytes": image_bytes})
    return parse_text(response)


def moderation_status(confidence: float, review_threshold: float, restricted_threshold: float) -> str:
    """Map one confidence score to safe, review, or restricted."""
    if confidence >= restricted_threshold:
        return "restricted"
    if confidence >= review_threshold:
        return "review"
    return "safe"


def parse_moderation(response: dict, review_threshold: float, restricted_threshold: float) -> dict:
    """Summarize moderation labels. The strictest label sets the overall status."""
    labels = []
    highest = 0.0
    status = "safe"
    for label in response.get("ModerationLabels", []):
        confidence = _round(label.get("Confidence")) or 0.0
        highest = max(highest, confidence)
        label_status = moderation_status(confidence, review_threshold, restricted_threshold)
        # Restricted wins over review; review wins over safe.
        if label_status == "restricted":
            status = "restricted"
        elif label_status == "review" and status != "restricted":
            status = "review"
        level = label.get("TaxonomyLevel")
        labels.append(
            {
                "name": label.get("Name") or "Unknown",
                "parent": label.get("ParentName") or None,
                "confidence": confidence,
                "taxonomy_level": int(level) if level is not None else None,
            }
        )
    labels.sort(key=lambda item: item["confidence"] or 0, reverse=True)
    return {
        "status": status,
        "highest_confidence": _round(highest) if labels else 0.0,
        "label_count": len(labels),
        "labels": labels,
        "review_threshold": review_threshold,
        "restricted_threshold": restricted_threshold,
    }


def detect_moderation_labels(
    image_bytes: bytes,
    review_threshold: float = 50.0,
    restricted_threshold: float = 80.0,
) -> dict:
    """Call DetectModerationLabels using the review threshold as MinConfidence.

    Labels below the review cutoff are not returned by AWS, so they cannot
    change the status away from safe.
    """
    response = _invoke(
        "detect_moderation_labels",
        Image={"Bytes": image_bytes},
        MinConfidence=float(review_threshold),
    )
    return parse_moderation(response, review_threshold, restricted_threshold)
