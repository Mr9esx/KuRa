package handler

import (
	"net/http"

	"github.com/Mr9esx/RiSu/server/internal/publisher"
	"github.com/labstack/echo/v4"
)

type PublishHandler struct {
	Publisher *publisher.Publisher
}

func (h *PublishHandler) Publish(c echo.Context) error {
	result, err := h.Publisher.Publish()
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"summary": result,
	})
}
