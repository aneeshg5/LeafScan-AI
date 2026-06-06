import io

import torch
from fastapi.testclient import TestClient
from PIL import Image as PILImage

from app.auth import require_auth
from app.main import app
from app.models.classifier import OODException, classifier

client = TestClient(app)


# ---------------------------------------------------------------------------
# Existing auth guard test
# ---------------------------------------------------------------------------

def test_predict_requires_auth():
    response = client.post("/predict", files={"file": ("leaf.jpg", b"fake", "image/jpeg")})
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# OOD math unit tests (no model loading required)
# ---------------------------------------------------------------------------

def _inject_ood_stats(means: torch.Tensor, precision: torch.Tensor, threshold: float):
    """Helper: inject synthetic OOD stats into the singleton classifier."""
    orig = (classifier._class_means, classifier._precision, classifier._ood_threshold)
    classifier._class_means = means
    classifier._precision = precision
    classifier._ood_threshold = threshold
    return orig


def _restore_ood_stats(orig):
    classifier._class_means, classifier._precision, classifier._ood_threshold = orig


def test_ood_score_near_centroid_is_low():
    """A feature vector at the centroid should have Mahalanobis distance ≈ 0."""
    orig = _inject_ood_stats(
        means=torch.zeros(38, 1280),
        precision=torch.eye(1280),
        threshold=50.0,
    )
    try:
        at_origin = torch.zeros(1280)
        score = classifier._mahalanobis_ood_score(at_origin)
        assert score < 1e-3, f"Expected score near 0, got {score}"
    finally:
        _restore_ood_stats(orig)


def test_ood_score_far_from_centroid_is_high():
    """A feature vector far from all centroids should have a large score."""
    orig = _inject_ood_stats(
        means=torch.zeros(38, 1280),
        precision=torch.eye(1280),
        threshold=50.0,
    )
    try:
        # Distance = sqrt(1280 * 5^2) ≈ 178.9
        far = torch.ones(1280) * 5.0
        score = classifier._mahalanobis_ood_score(far)
        assert score > 100.0, f"Expected high OOD score, got {score}"
    finally:
        _restore_ood_stats(orig)


def test_ood_score_ordering():
    """Score monotonically increases with distance from centroid."""
    orig = _inject_ood_stats(
        means=torch.zeros(38, 1280),
        precision=torch.eye(1280),
        threshold=50.0,
    )
    try:
        near = torch.ones(1280) * 0.1
        mid = torch.ones(1280) * 1.0
        far = torch.ones(1280) * 5.0
        s_near = classifier._mahalanobis_ood_score(near)
        s_mid = classifier._mahalanobis_ood_score(mid)
        s_far = classifier._mahalanobis_ood_score(far)
        assert s_near < s_mid < s_far, f"Expected ordering, got {s_near:.2f} < {s_mid:.2f} < {s_far:.2f}"
    finally:
        _restore_ood_stats(orig)


# ---------------------------------------------------------------------------
# OOD integration test: endpoint returns 422 for rejected images
# ---------------------------------------------------------------------------

def _make_jpeg(color=(34, 139, 34)) -> bytes:
    img = PILImage.new("RGB", (100, 100), color=color)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


def test_ood_rejected_returns_422():
    """OOD-rejected images must return 422 and never reach the rate-limit query."""
    app.dependency_overrides[require_auth] = lambda: "00000000-0000-0000-0000-000000000000"
    orig = _inject_ood_stats(
        # Class means at origin, identity precision, threshold=0 → everything is OOD
        means=torch.zeros(38, 1280),
        precision=torch.eye(1280),
        threshold=0.0001,
    )
    try:
        with TestClient(app) as c:
            response = c.post(
                "/predict",
                files={"file": ("leaf.jpg", _make_jpeg(), "image/jpeg")},
            )
        assert response.status_code == 422, response.text
        detail = response.json()["detail"]
        assert "leaf" in detail.lower(), f"Unexpected detail: {detail}"
    finally:
        _restore_ood_stats(orig)
        app.dependency_overrides.clear()


def test_ood_disabled_when_stats_absent():
    """When OOD stats are not loaded, predict() must NOT raise OODException."""
    if not classifier.is_loaded():
        return  # can't test predict() without model; silently skip

    orig = _inject_ood_stats(
        means=None,    # type: ignore[arg-type]
        precision=None,  # type: ignore[arg-type]
        threshold=0.0,
    )
    try:
        # A valid JPEG should not raise OODException regardless of threshold
        # (because _class_means is None → check is skipped)
        result = classifier.predict(_make_jpeg())
        assert "disease_name" in result
    except OODException:
        raise AssertionError("OODException raised when stats are not loaded")
    finally:
        _restore_ood_stats(orig)
