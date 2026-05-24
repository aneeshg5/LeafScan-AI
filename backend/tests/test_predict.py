from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_predict_requires_auth():
    response = client.post("/predict", files={"file": ("leaf.jpg", b"fake", "image/jpeg")})
    assert response.status_code == 403
