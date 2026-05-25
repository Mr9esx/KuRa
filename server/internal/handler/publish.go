package handler

import (
	"fmt"
	"net/http"
	"time"

	"github.com/Mr9esx/RiSu/server/internal/publisher"
	"github.com/Mr9esx/RiSu/server/internal/service"
	"github.com/labstack/echo/v4"
)

type PublishHandler struct {
	Publisher      *publisher.Publisher
	ReleaseService *service.ReleaseService
	ArtifactPath   string
}

type PublishRequest struct {
	Confirm bool `json:"confirm"`
}

func (h *PublishHandler) Preview(c echo.Context) error {
	preview, err := h.Publisher.Preview()
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"preview": preview,
	})
}

func (h *PublishHandler) Publish(c echo.Context) error {
	req := PublishRequest{Confirm: true}
	if c.Request().ContentLength > 0 {
		if err := c.Bind(&req); err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
		}
	}
	if !req.Confirm {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "confirm=true is required"})
	}

	result, err := h.Publisher.Publish()
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}

	releaseID := fmt.Sprintf("%s-manual-%06d", result.PublishedAt.Format("20060102150405"), result.PublishedAt.UnixNano()%1_000_000)
	var releaseRecord interface{} = nil
	if h.ReleaseService != nil {
		row, releaseErr := h.ReleaseService.UpsertRelease(service.CreateReleaseInput{
			ReleaseID:    releaseID,
			Branch:       "admin-manual",
			BeforeSHA:    "",
			AfterSHA:     "",
			ArtifactPath: h.ArtifactPath,
			DiffSummary:  result.DiffSummary,
			DataSnapshot: result.Snapshot,
			Status:       "deployed",
			DeployedAt:   time.Now(),
		})
		if releaseErr != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": releaseErr.Error()})
		}
		releaseRecord = row
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"summary": result,
		"release": releaseRecord,
	})
}
