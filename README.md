# GameZone backend media workflow

## Reel generation

When a game session ends, the camera service finalizes and uploads each
assigned camera recording. The backend then builds a vertical reel from
pre-game photos and short clips sampled across the completed recordings. Clips
are rotated across available cameras and combined with background music. Reel
footage has no generated text overlays; the Zestopia logo appears only during
the final ending segment.

The default durations are selected by game name:

| Game name contains | Photo intro | Gameplay | Ending | Approx. total |
| --- | ---: | ---: | ---: | ---: |
| `laser` or `VR` | 6 sec | 39 sec | 5 sec | 50 sec |
| `bowling` | 6 sec | 140 sec | 5 sec | 151 sec |
| Other | 6 sec | 30 sec | 5 sec | 41 sec |

An active default reel template for a game (or a general default template)
overrides those gameplay and ending settings. Template configuration is JSON,
for example:

```json
{
  "photos": { "collage_duration": 6, "max_photos": 5 },
  "gameplay": {
    "duration": 39
  },
  "ending": {
    "duration": 5
  },
  "branding": {
    "show_logo": true,
    "logo_position": "top_right",
    "background_music": true
  }
}
```

FFmpeg must be installed on the backend host and available on `PATH`, or
`FFMPEG_PATH` must point to its executable. The generated reel uses the
configured Cloudinary account.

## Aiven MySQL connection

Set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME` in the
backend environment using the values from the Aiven service's connection
information. Download the service CA certificate and set `DB_SSL_CA_PATH` to
its location on the backend host. The MySQL pool uses that certificate and
verifies the server certificate when this setting is present. Keep the CA file
outside the public web root and do not commit database credentials.

```text
DB_SSL_CA_PATH=C:\GameZone\certs\aiven-ca.pem
```

Allow the backend host's outbound IP in Aiven's allowed IP ranges. Do not
expose the database port to all addresses.

## QR expiry and customer downloads

Set `REEL_RETENTION_MINUTES` to `30` or `60`; the default is `60`. The QR code
and generated reel are removed after that period by the scheduled cleanup.
Customers can download or share the reel from the public QR page before it
expires.

## Gemini AI highlights (free-tier prototype)

The backend can ask Gemini to score highlights per camera, then interleave
those clips in the montage. Gemini is opt-in. If it is not configured, its
free-tier quota is exhausted, or the response is invalid, the reel uses the
deterministic multi-camera sampler instead and logs why.

Configure these values in the backend environment:

```text
GEMINI_API_KEY=your-google-ai-studio-key
GEMINI_MODEL=gemini-4-hydrogen
GEMINI_ALLOW_CUSTOMER_VIDEO=false
```

Set `GEMINI_ALLOW_CUSTOMER_VIDEO=true` only after obtaining appropriate
customer consent and approving the data-sharing terms. Gemini's free tier has
model and usage limits, and Google states that free-tier content may be used
to improve its products. Do not use it for customer footage unless that
privacy tradeoff is approved. Free-tier video files are limited to 2 GB; the
backend deletes uploaded Gemini files after analysis, while Google's Files
API otherwise automatically deletes them after 48 hours.

Gemini free-tier availability and quotas can change. Check the
[official Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
and [video input documentation](https://ai.google.dev/gemini-api/docs/video-understanding)
before deployment. The free tier is intended for testing, not guaranteed
production capacity.