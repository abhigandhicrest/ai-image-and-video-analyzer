"""Response models returned to the client. AWS credentials are not included.

Each model is the JSON shape of one part of an analysis. Bounding boxes use
fractions of the image (0 to 1), matching Rekognition, not pixel coordinates.
"""

from pydantic import BaseModel, Field


class BoundingBox(BaseModel):
    """Normalized rectangle: width, height, left, and top as fractions of the image."""
    width: float
    height: float
    left: float
    top: float


class LabelInstance(BaseModel):
    """One located occurrence of a label, when Rekognition returned a box."""
    confidence: float | None = None
    bounding_box: BoundingBox | None = None


class DetectedObject(BaseModel):
    """A DetectLabels result, including parents, categories, and the group kind."""
    name: str
    confidence: float | None = None
    parents: list[str] = Field(default_factory=list)
    categories: list[str] = Field(default_factory=list)
    kind: str | None = None
    instance_count: int = 0
    instances: list[LabelInstance] = Field(default_factory=list)


class LabelGroups(BaseModel):
    """How many labels fell into each of the four display groups."""
    animal: int = 0
    vehicle: int = 0
    object: int = 0
    other: int = 0


class LabelsResult(BaseModel):
    """Full object-detection payload returned for a labels or full analysis."""
    label_count: int
    labels: list[DetectedObject]
    groups: LabelGroups | None = None


class AttributeScore(BaseModel):
    """A face attribute value (boolean or label) plus Rekognition's confidence."""
    value: bool | str | None = None
    confidence: float | None = None


class EmotionScore(BaseModel):
    """One emotion name and its confidence for a detected face."""
    type: str | None = None
    confidence: float | None = None


class FacePose(BaseModel):
    """Head roll, yaw, and pitch in degrees."""
    roll: float | None = None
    yaw: float | None = None
    pitch: float | None = None


class FaceQuality(BaseModel):
    """Brightness and sharpness scores Rekognition assigned to a face."""
    brightness: float | None = None
    sharpness: float | None = None


class AgeRange(BaseModel):
    """Estimated age span. Both ends can be missing."""
    low: int | None = None
    high: int | None = None


class Landmark(BaseModel):
    """A facial landmark. x and y are fractions of the image."""
    type: str | None = None
    x: float | None = None
    y: float | None = None


class DetectedFace(BaseModel):
    """Everything DetectFaces returns for one face, in the API's field names."""
    confidence: float | None = None
    bounding_box: BoundingBox | None = None
    age_range: AgeRange | None = None
    gender: AttributeScore | None = None
    smile: AttributeScore | None = None
    eyeglasses: AttributeScore | None = None
    sunglasses: AttributeScore | None = None
    beard: AttributeScore | None = None
    mustache: AttributeScore | None = None
    eyes_open: AttributeScore | None = None
    mouth_open: AttributeScore | None = None
    emotions: list[EmotionScore] = Field(default_factory=list)
    pose: FacePose | None = None
    quality: FaceQuality | None = None
    landmarks: list[Landmark] = Field(default_factory=list)


class FacesResult(BaseModel):
    """Face-detection payload: a count plus the list of faces."""
    face_count: int
    faces: list[DetectedFace]


class TextItem(BaseModel):
    """One detected line or word, with its parent id when Rekognition supplied one."""
    text: str
    confidence: float | None = None
    type: str | None = None
    id: int | None = None
    parent_id: int | None = None
    bounding_box: BoundingBox | None = None


class TextResult(BaseModel):
    """Text-detection payload. full_text joins the lines in reading order."""
    line_count: int
    word_count: int
    full_text: str
    lines: list[TextItem]
    words: list[TextItem]


class ModerationLabel(BaseModel):
    """One content-moderation label and where it sits in the Rekognition taxonomy."""
    name: str
    parent: str | None = None
    confidence: float | None = None
    taxonomy_level: int | None = None


class ModerationResult(BaseModel):
    """Overall moderation status plus the labels that met the review threshold."""
    status: str
    highest_confidence: float | None = None
    label_count: int
    labels: list[ModerationLabel]
    review_threshold: float
    restricted_threshold: float


class Thresholds(BaseModel):
    """Cutoffs that were in effect when the analysis ran."""
    review: float | None = None
    restricted: float | None = None
    label_min_confidence: float | None = None


class AnalysisSummary(BaseModel):
    """Compact counts stored for list and dashboard views."""
    label_count: int = 0
    face_count: int = 0
    text_count: int = 0
    animal_count: int = 0
    vehicle_count: int = 0
    object_count: int = 0
    other_count: int = 0
    top_labels: list[str] = Field(default_factory=list)
    highest_moderation_confidence: float | None = None


class VideoFrameResult(BaseModel):
    """Rekognition scores for one sampled moment in a video."""
    index: int
    timestamp_ms: int
    labels: LabelsResult
    faces: FacesResult
    text: TextResult
    moderation: ModerationResult


class VideoResult(BaseModel):
    """Duration and the frames that were sent to Rekognition. The video file is not included."""
    duration_ms: int
    frame_count: int
    width: int | None = None
    height: int | None = None
    frames: list[VideoFrameResult] = Field(default_factory=list)


class AnalysisResults(BaseModel):
    """Optional result sections. A partial analysis fills only the sections it ran.

    A video record also fills labels, faces, text, and moderation with the
    combined scores, and keeps each sample under video.frames.
    """
    labels: LabelsResult | None = None
    faces: FacesResult | None = None
    text: TextResult | None = None
    moderation: ModerationResult | None = None
    video: VideoResult | None = None


class AnalysisRecord(BaseModel):
    """One saved or just-completed analysis returned to the client.

    persisted is false when MongoDB could not store the document. results is
    omitted from list responses.
    """
    id: str | None = None
    filename: str
    file_size: int
    content_type: str | None = None
    analysis_type: str
    moderation_status: str | None = None
    summary: AnalysisSummary
    thresholds: Thresholds | None = None
    created_at: str
    persisted: bool = True
    persist_error: str | None = None
    results: AnalysisResults | None = None


class HistoryList(BaseModel):
    """One page of history items plus the total matching the current filter."""
    items: list[AnalysisRecord]
    total: int
    limit: int
    skip: int


class StatsResponse(BaseModel):
    """Dashboard totals and the newest analyses."""
    total_analyses: int
    object_count: int
    face_count: int
    safe_count: int
    review_count: int
    restricted_count: int
    recent: list[AnalysisRecord]


class HealthResponse(BaseModel):
    """Health payload. aws_credentials_configured is a boolean, never the secret."""
    status: str
    api: str
    mongo: str
    aws_region: str
    aws_credentials_configured: bool
