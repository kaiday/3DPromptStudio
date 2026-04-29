from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import app
from app.schemas.operations import OperationTarget, SceneOperation
from app.schemas.prompts import PromptInterpretRequest, PromptOperationPlan
from app.services.component_service import get_component_registry, save_component_registry
from app.services.prompt_service import interpret_prompt
from tests.fixtures import load_fixture


def unique_project_id() -> str:
    return f"project_{uuid4().hex}"


def seed_registry(client: TestClient, project_id: str):
    response = client.put(f"/api/projects/{project_id}/components", json=load_fixture("road_safety_registry.json"))
    assert response.status_code == 200


def test_openai_provider_uses_mocked_structured_output(monkeypatch):
    client = TestClient(app)
    project_id = unique_project_id()
    seed_registry(client, project_id)

    def fake_plan(prompt, context, settings):
        assert prompt == "make the stop sign green"
        assert context["components"]
        return PromptOperationPlan(
            operations=[
                SceneOperation(
                    type="setColor",
                    target=OperationTarget(componentId="stop_sign_left"),
                    payload={"color": "#22C55E"},
                    confidence=0.91,
                )
            ]
        )

    monkeypatch.setattr("app.services.prompt_service.create_openai_operation_plan", fake_plan)

    db_generator = app.dependency_overrides.get("unused")
    assert db_generator is None

    from app.db.session import get_db

    db_session = get_db()
    db = next(db_session)
    try:
        registry = get_component_registry(db, project_id)
        response, source = interpret_prompt(
            project_id,
            PromptInterpretRequest(prompt="make the stop sign green", mode="preview"),
            registry,
            db,
            Settings(ai_prompt_provider="openai", openai_api_key="test-key", openai_prompt_model="test-model"),
        )
    finally:
        db_session.close()

    assert source == "openai"
    assert response.ok is True
    assert response.operations[0].type == "setColor"
    assert response.operations[0].target.component_id == "stop_sign_left"
    assert response.operations[0].source is not None
    assert response.operations[0].source.agent == "openai"


def test_openai_output_is_still_validated(monkeypatch):
    client = TestClient(app)
    project_id = unique_project_id()
    seed_registry(client, project_id)

    def fake_plan(prompt, context, settings):
        return PromptOperationPlan(
            operations=[
                SceneOperation(
                    type="setColor",
                    target=OperationTarget(componentId="missing_part"),
                    payload={"color": "#22C55E"},
                    confidence=0.91,
                )
            ]
        )

    monkeypatch.setattr("app.services.prompt_service.create_openai_operation_plan", fake_plan)

    from app.db.session import get_db
    from app.services.operation_service import OperationValidationError

    db_session = get_db()
    db = next(db_session)
    try:
        registry = get_component_registry(db, project_id)
        try:
            interpret_prompt(
                project_id,
                PromptInterpretRequest(prompt="make it green", mode="preview"),
                registry,
                db,
                Settings(ai_prompt_provider="openai", openai_api_key="test-key", openai_prompt_model="test-model"),
            )
        except OperationValidationError as error:
            assert error.error.code == "TARGET_NOT_FOUND"
        else:
            raise AssertionError("OpenAI output bypassed validation")
    finally:
        db_session.close()


def test_openai_provider_requires_api_key():
    from app.db.session import get_db
    from app.services.operation_service import OperationValidationError

    project_id = unique_project_id()
    db_session = get_db()
    db = next(db_session)
    try:
        save_component_registry(db, project_id, get_registry_payload())
        registry = get_component_registry(db, project_id)
        try:
            interpret_prompt(
                project_id,
                PromptInterpretRequest(prompt="make the stop sign green", mode="preview"),
                registry,
                db,
                Settings(ai_prompt_provider="openai", openai_api_key=None),
            )
        except OperationValidationError as error:
            assert error.error.code == "OPENAI_API_KEY_REQUIRED"
        else:
            raise AssertionError("OpenAI provider did not require an API key")
    finally:
        db_session.close()


def get_registry_payload():
    from app.schemas.components import ComponentRegistryPayload

    return ComponentRegistryPayload.model_validate(load_fixture("road_safety_registry.json"))
