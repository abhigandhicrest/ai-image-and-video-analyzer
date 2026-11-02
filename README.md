# AI Image Analyzer

Upload a JPG or PNG, or a short MP4, MOV, or WebM clip, and inspect it with Amazon Rekognition. The React app shows detected objects, faces, extracted text, and a moderation status. FastAPI performs the analysis, and MongoDB stores the structured results. Image and video files are not written to the database, and AWS credentials never leave the backend.

This is not a live or streaming analyzer. You choose a finished file, send it once, and wait for Rekognition to return. A photo usually finishes in a few seconds. A video takes longer because the server samples frames and analyzes each one.

Video analysis does not use Amazon S3 or Rekognition’s stored-video jobs. The API samples up to six frames on the server and runs the same four image APIs on each frame. Six frames are 24 image analyses.

## Project structure

```text
frontend/          React + Vite dashboard
backend/           FastAPI, Rekognition, and MongoDB
  app/routes/      HTTP endpoints
  app/services/    Rekognition, image and video validation, frame sampling, and history
  app/database/    MongoDB connection
  app/config/      Environment settings
  app/models/      Response schemas
```

## Prerequisites

- Node.js 18 or newer
- Python 3.10 or newer
- MongoDB running locally (`mongodb://localhost:27017`)
- An AWS account with Rekognition enabled in your chosen region

Create an IAM user or role that can call only these actions. Rekognition requires `Resource` to be `*` for them:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ImageAnalyzerRekognition",
      "Effect": "Allow",
      "Action": [
        "rekognition:DetectLabels",
        "rekognition:DetectFaces",
        "rekognition:DetectText",
        "rekognition:DetectModerationLabels"
      ],
      "Resource": "*"
    }
  ]
}
```

Images and sampled video frames both use those four actions. No S3 permissions are required.

## Backend

From the repository root:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
copy .env.example .env
```

`requirements.txt` includes OpenCV, which the API uses to read video frames. You do not need a separate FFmpeg install.

PowerShell often blocks `Activate.ps1`. You do not need to activate the virtual environment. Call its Python directly, as shown below. If you still want the shell prompt activated for the current window only:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

Edit `backend/.env` and set `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and `AWS_REGION`. The default region is `ap-south-1`. Do not commit `.env`.

If those two keys are left blank, Boto3 uses the standard AWS credential chain (environment variables already set for the process, the shared credentials file, or an instance role). Restart the API after changing `.env`.

Optional settings in `backend/.env`:

| Variable | Default | Purpose |
| --- | --- | --- |
| `MONGO_URI` | `mongodb://localhost:27017` | MongoDB connection |
| `MONGO_DB_NAME` | `image_analyzer` | Database name |
| `CORS_ORIGINS` | local Vite origins | Browsers allowed to call the API |
| `MAX_UPLOAD_BYTES` | `5242880` (5 MB) | Image size cap |
| `MAX_VIDEO_BYTES` | `52428800` (50 MB) | Video size cap |
| `MAX_VIDEO_SECONDS` | `60` | Longest clip accepted |
| `VIDEO_SAMPLE_FRAMES` | `6` | Frames sampled per clip (1–8) |
| `MODERATION_REVIEW_THRESHOLD` | `50` | Default review cutoff |
| `MODERATION_RESTRICTED_THRESHOLD` | `80` | Default restricted cutoff |
| `LABEL_MIN_CONFIDENCE` | `50` | Default minimum object confidence |

Start the API:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Interactive docs are at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs). Health check:

```powershell
curl.exe http://127.0.0.1:8000/api/health
```

If port 8000 is already taken, start Uvicorn on another port and point the frontend proxy at it:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8010
```

Then start the frontend with `API_PROXY_TARGET` set to `http://127.0.0.1:8010`, as shown in the next section.

## Frontend

In a second terminal, from the repository root. Laragon’s Node.js is not on the default PowerShell path, so add it for this window first:

```powershell
cd frontend
$env:Path = "D:\laragon\bin\nodejs\node-v22.23.4-win-x64;" + $env:Path
npm.cmd install
$env:API_PROXY_TARGET = "http://127.0.0.1:8010"
npm.cmd run dev
```

Use `npm.cmd`, not `npm`. PowerShell otherwise runs `npm.ps1`, which this machine blocks.

Use port 8000 in `API_PROXY_TARGET` when the API is started on 8000. Leave it unset only if the API is already on 8000, which is the Vite proxy default.

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). The Vite dev server proxies `/api` to the backend, so the API base URL in Settings can stay blank.

## Using the app

### Analyze an image

1. Open **Analyze**.
2. Drag in a JPG, JPEG, or PNG, or browse for one. Files larger than 5 MB are rejected.
3. Check the preview, then choose **Analyze image**.
4. Review objects, faces, text, and moderation. Face boxes can be drawn on the preview; object and text boxes are optional.

### Analyze a video

1. Open **Analyze video**.
2. Drag in an MP4, MOV, or WebM clip, or browse for one. Files larger than 50 MB, or longer than 60 seconds, are rejected.
3. Choose **Analyze video**. The server samples six frames spread through the clip, encodes each as a JPEG, and runs object detection, face detection, text extraction, and moderation on every frame.
4. Read the combined summary. Item counts are unique labels across the samples. The face list is the busiest sampled frame. Moderation uses the strictest frame.
5. Select a sampled frame to seek the preview and draw that frame’s boxes. Playback hides the boxes until the video is paused again.

The preview player exists only for the clip you just uploaded. History keeps the scores, not the file.

### History and settings

- Open **History** to view or delete a saved record. Filter by type, including **Video**.
- Use **Settings** to change the moderation thresholds and the minimum object confidence. Those values are stored in the browser and sent with the next analysis.

Moderation status:

- **Safe** — no returned label reaches the review threshold (default 50%).
- **Review Required** — a label reaches the review threshold and stays below the restricted threshold.
- **Restricted** — a label reaches the restricted threshold (default 80%).

For a video, the status is the strictest status among the sampled frames.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | API, MongoDB, and AWS configuration status |
| POST | `/api/analyze` | Labels, faces, text, and moderation in one record |
| POST | `/api/analyze/video` | Sample up to six frames and run the four image APIs on each |
| POST | `/api/analyze/labels` | `DetectLabels` |
| POST | `/api/analyze/faces` | `DetectFaces` |
| POST | `/api/analyze/text` | `DetectText` |
| POST | `/api/analyze/moderation` | `DetectModerationLabels` |
| GET | `/api/history` | Paged history (`limit`, `skip`, `analysis_type`, `filename`) |
| GET | `/api/history/{id}` | One saved analysis |
| DELETE | `/api/history/{id}` | Delete one saved analysis |
| GET | `/api/stats` | Dashboard counts |

`analysis_type` on the history list may be `full`, `labels`, `faces`, `text`, `moderation`, or `video`.

Send the image or video as multipart form data with the field name `file`. Optional query parameters:

- `min_confidence` on label, full, and video analysis (0–100)
- `review_threshold` and `restricted_threshold` on moderation, full, and video analysis

Examples:

```powershell
curl.exe -X POST "http://127.0.0.1:8000/api/analyze/labels?min_confidence=70" -F "file=@C:\path\to\photo.jpg"
curl.exe -X POST "http://127.0.0.1:8000/api/analyze/video?min_confidence=70" -F "file=@C:\path\to\clip.mp4"
```

The dashboard calls `POST /api/analyze` for images and `POST /api/analyze/video` for clips. Each call stores one history document. The single-purpose image endpoints store their own records when called directly.

Responses never include access keys, secret keys, or raw AWS metadata. If Rekognition rejects the call, the API returns HTTP 502 with a short message and an error code.

## What is stored

Each MongoDB document in the `analyses` collection contains:

- sanitized filename and file size
- content type and analysis type
- thresholds used for that run
- summary counts and the structured Rekognition results
- for a video, duration, picture size, and the scores for each sampled frame
- creation time, stored in UTC and shown in the browser’s local time

The original image or video bytes are discarded after the Rekognition calls. A video history record can be opened later, but the player is only available during the analysis that uploaded the file.

## Troubleshooting

- **API offline** in the header: start Uvicorn from the `backend` directory.
- **AWS credentials**: fill in `backend/.env` and restart Uvicorn, or configure the AWS credential chain. A 502 that mentions credentials or permissions means Rekognition rejected the keys or IAM policy.
- **Database offline**: start MongoDB and confirm `MONGO_URI`. Analysis can still return results, but history will not be saved.
- **Unsupported image**: the browser and the API both allow only JPG, JPEG, and PNG up to 5 MB. Renamed files are checked against their real contents.
- **Unsupported video**: the browser and the API both allow only MP4, MOV, and WebM up to 50 MB and 60 seconds. Renamed files are checked against their real contents, and OpenCV must be able to open the clip.
- **Video request timed out**: six frames mean 24 Rekognition image calls. Try a shorter clip, or raise the client timeout only if the API is still working.
- **CORS error**: keep the Settings API URL blank in development, or add the frontend origin to `CORS_ORIGINS`.
