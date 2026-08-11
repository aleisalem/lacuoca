from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str
    totp_code: str | None = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    requires_totp: bool = False


class RefreshRequest(BaseModel):
    refresh_token: str


class TOTPSetupResponse(BaseModel):
    secret: str
    uri: str
    qr_data_url: str


class TOTPVerifyRequest(BaseModel):
    code: str


class PasswordResetRequest(BaseModel):
    user_id: str
    new_password: str
