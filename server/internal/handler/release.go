package handler

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/Mr9esx/RiSu/server/internal/service"
	"github.com/labstack/echo/v4"
	"gorm.io/gorm"
)

type ReleaseHandler struct {
	Service *service.ReleaseService
}

func (h *ReleaseHandler) List(c echo.Context) error {
	limit, _ := strconv.Atoi(c.QueryParam("limit"))
	rows, err := h.Service.ListReleases(limit)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	return c.JSON(http.StatusOK, rows)
}

func (h *ReleaseHandler) Get(c echo.Context) error {
	releaseID := c.Param("release_id")
	row, err := h.Service.GetReleaseByID(releaseID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return c.JSON(http.StatusNotFound, map[string]string{"error": "release not found"})
		}
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	return c.JSON(http.StatusOK, row)
}

func (h *ReleaseHandler) ListRollbacks(c echo.Context) error {
	limit, _ := strconv.Atoi(c.QueryParam("limit"))
	rows, err := h.Service.ListRollbacks(limit)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	return c.JSON(http.StatusOK, rows)
}

type UpsertReleaseRequest struct {
	ReleaseID    string `json:"release_id"`
	Branch       string `json:"branch"`
	BeforeSHA    string `json:"before_sha"`
	AfterSHA     string `json:"after_sha"`
	ArtifactPath string `json:"artifact_path"`
	DiffSummary  string `json:"diff_summary"`
	Status       string `json:"status"`
	DeployedAt   string `json:"deployed_at"`
}

func (h *ReleaseHandler) Upsert(c echo.Context) error {
	var req UpsertReleaseRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	var deployedAt time.Time
	if req.DeployedAt != "" {
		t, err := time.Parse(time.RFC3339, req.DeployedAt)
		if err != nil {
			return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid deployed_at format"})
		}
		deployedAt = t
	}

	row, err := h.Service.UpsertRelease(service.CreateReleaseInput{
		ReleaseID:    req.ReleaseID,
		Branch:       req.Branch,
		BeforeSHA:    req.BeforeSHA,
		AfterSHA:     req.AfterSHA,
		ArtifactPath: req.ArtifactPath,
		DiffSummary:  req.DiffSummary,
		Status:       req.Status,
		DeployedAt:   deployedAt,
	})
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
	}
	return c.JSON(http.StatusOK, row)
}

type RecordRollbackRequest struct {
	FromReleaseID string `json:"from_release_id"`
	ToReleaseID   string `json:"to_release_id"`
	Operator      string `json:"operator"`
	Reason        string `json:"reason"`
}

func (h *ReleaseHandler) RecordRollback(c echo.Context) error {
	var req RecordRollbackRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	row, err := h.Service.RecordRollback(service.RecordRollbackInput{
		FromReleaseID: req.FromReleaseID,
		ToReleaseID:   req.ToReleaseID,
		Operator:      req.Operator,
		Reason:        req.Reason,
	})
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": err.Error()})
	}
	return c.JSON(http.StatusOK, row)
}
