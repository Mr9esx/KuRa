package middleware

import (
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
	"github.com/labstack/echo/v4"
)

type JWTClaims struct {
	UserID   uint   `json:"user_id"`
	Username string `json:"username"`
	jwt.RegisteredClaims
}

func AuthRequired(secret string) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			auth := c.Request().Header.Get("Authorization")
			if auth == "" {
				return c.JSON(http.StatusUnauthorized, map[string]string{"error": "missing authorization header"})
			}

			parts := strings.SplitN(auth, " ", 2)
			if len(parts) != 2 || parts[0] != "Bearer" {
				return c.JSON(http.StatusUnauthorized, map[string]string{"error": "invalid authorization format"})
			}

			token, err := jwt.ParseWithClaims(parts[1], &JWTClaims{}, func(t *jwt.Token) (interface{}, error) {
				return []byte(secret), nil
			})
			if err != nil || !token.Valid {
				return c.JSON(http.StatusUnauthorized, map[string]string{"error": "invalid token"})
			}

			claims, ok := token.Claims.(*JWTClaims)
			if !ok {
				return c.JSON(http.StatusUnauthorized, map[string]string{"error": "invalid claims"})
			}

			c.Set("user_id", claims.UserID)
			c.Set("username", claims.Username)
			return next(c)
		}
	}
}
