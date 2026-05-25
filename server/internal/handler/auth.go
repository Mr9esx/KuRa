package handler

import (
	"net/http"
	"time"

	"github.com/Mr9esx/RiSu/server/internal/middleware"
	"github.com/Mr9esx/RiSu/server/internal/model"
	"github.com/golang-jwt/jwt/v5"
	"github.com/labstack/echo/v4"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type AuthHandler struct {
	DB        *gorm.DB
	JWTSecret string
}

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type LoginResponse struct {
	Token string `json:"token"`
	User  struct {
		ID       uint   `json:"id"`
		Username string `json:"username"`
	} `json:"user"`
}

func (h *AuthHandler) Login(c echo.Context) error {
	var req LoginRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	var user model.User
	if err := h.DB.Where("username = ?", req.Username).First(&user).Error; err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "invalid credentials"})
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		return c.JSON(http.StatusUnauthorized, map[string]string{"error": "invalid credentials"})
	}

	claims := &middleware.JWTClaims{
		UserID:   user.ID,
		Username: user.Username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(72 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenStr, err := token.SignedString([]byte(h.JWTSecret))
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to generate token"})
	}

	resp := LoginResponse{Token: tokenStr}
	resp.User.ID = user.ID
	resp.User.Username = user.Username
	return c.JSON(http.StatusOK, resp)
}

func (h *AuthHandler) Me(c echo.Context) error {
	userID := c.Get("user_id").(uint)
	username := c.Get("username").(string)
	return c.JSON(http.StatusOK, map[string]interface{}{
		"id":       userID,
		"username": username,
	})
}
