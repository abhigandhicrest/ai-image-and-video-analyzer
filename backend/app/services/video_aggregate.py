"""Combine per-frame Rekognition scores into one clip summary.

The functions here stay free of OpenCV so history can roll up saved frames
without loading the video decoder.
"""

_STATUS_RANK = {"safe": 0, "review": 1, "restricted": 2}


def _strictest(current: str, candidate: str) -> str:
    """Return the moderation status that should win when both are present."""
    if _STATUS_RANK.get(candidate, 0) > _STATUS_RANK.get(current, 0):
        return candidate
    return current


def _merge_labels(frames: list[dict]) -> dict:
    """Keep each label once, at its highest confidence, and count frames that saw it."""
    best: dict[str, dict] = {}
    counts: dict[str, int] = {}
    for frame in frames:
        seen: set[str] = set()
        for label in (frame.get("labels") or {}).get("labels") or []:
            name = label.get("name") or "Unknown"
            if name in seen:
                continue
            seen.add(name)
            counts[name] = counts.get(name, 0) + 1
            current = best.get(name)
            if current is None or (label.get("confidence") or 0) > (current.get("confidence") or 0):
                best[name] = label

    groups = {"animal": 0, "vehicle": 0, "object": 0, "other": 0}
    labels = []
    for name, label in best.items():
        kind = label.get("kind") if label.get("kind") in groups else "other"
        groups[kind] += 1
        labels.append(
            {
                "name": name,
                "confidence": label.get("confidence"),
                "parents": label.get("parents") or [],
                "categories": label.get("categories") or [],
                "kind": kind,
                "instance_count": counts[name],
                "instances": [],
            }
        )
    labels.sort(key=lambda item: item["confidence"] or 0, reverse=True)
    return {"label_count": len(labels), "groups": groups, "labels": labels}


def _merge_faces(frames: list[dict]) -> dict:
    """Use the frame that contains the most faces as the combined face list.

    The same person would otherwise be counted again on every later sample.
    """
    busiest = None
    for frame in frames:
        faces = frame.get("faces") or {}
        count = int(faces.get("face_count") or 0)
        if busiest is None or count > int((busiest.get("faces") or {}).get("face_count") or 0):
            busiest = frame
    if busiest is None:
        return {"face_count": 0, "faces": []}
    faces = busiest.get("faces") or {}
    return {"face_count": int(faces.get("face_count") or 0), "faces": faces.get("faces") or []}


def _merge_text(frames: list[dict]) -> dict:
    """Keep the first reading of each distinct line and word, preferring a higher score."""
    lines: dict[str, dict] = {}
    line_order: list[str] = []
    words: dict[str, dict] = {}
    word_order: list[str] = []

    for frame in frames:
        text = frame.get("text") or {}
        for line in text.get("lines") or []:
            key = (line.get("text") or "").strip().casefold()
            if not key:
                continue
            current = lines.get(key)
            if current is None:
                line_order.append(key)
                lines[key] = {**line, "bounding_box": None}
            elif (line.get("confidence") or 0) > (current.get("confidence") or 0):
                lines[key] = {**line, "bounding_box": None}
        for word in text.get("words") or []:
            key = (word.get("text") or "").strip().casefold()
            if not key:
                continue
            current = words.get(key)
            if current is None:
                word_order.append(key)
                words[key] = {**word, "bounding_box": None}
            elif (word.get("confidence") or 0) > (current.get("confidence") or 0):
                words[key] = {**word, "bounding_box": None}

    line_list = [lines[key] for key in line_order]
    word_list = [words[key] for key in word_order]
    return {
        "line_count": len(line_list),
        "word_count": len(word_list),
        "full_text": "\n".join(line["text"] for line in line_list if line.get("text")),
        "lines": line_list,
        "words": word_list,
    }


def _merge_moderation(frames: list[dict]) -> dict:
    """The strictest frame sets the clip status. Labels keep their highest confidence."""
    status = "safe"
    highest = 0.0
    review = 50.0
    restricted = 80.0
    merged: dict[str, dict] = {}
    for frame in frames:
        moderation = frame.get("moderation") or {}
        if moderation.get("review_threshold") is not None:
            review = moderation["review_threshold"]
        if moderation.get("restricted_threshold") is not None:
            restricted = moderation["restricted_threshold"]
        status = _strictest(status, moderation.get("status") or "safe")
        highest = max(highest, float(moderation.get("highest_confidence") or 0))
        for label in moderation.get("labels") or []:
            name = label.get("name") or "Unknown"
            current = merged.get(name)
            if current is None or (label.get("confidence") or 0) > (current.get("confidence") or 0):
                merged[name] = label
    labels = sorted(merged.values(), key=lambda item: item.get("confidence") or 0, reverse=True)
    return {
        "status": status,
        "highest_confidence": round(highest, 2),
        "label_count": len(labels),
        "labels": labels,
        "review_threshold": review,
        "restricted_threshold": restricted,
    }


def aggregate_video_frames(frames: list[dict]) -> dict:
    """Build the labels, faces, text, and moderation sections stored beside the frames."""
    return {
        "labels": _merge_labels(frames),
        "faces": _merge_faces(frames),
        "text": _merge_text(frames),
        "moderation": _merge_moderation(frames),
    }
