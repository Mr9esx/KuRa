package handler

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/labstack/echo/v4"
)

type UploadHandler struct {
	DataDir string
}

func (h *UploadHandler) UploadModel(c echo.Context) error {
	file, err := c.FormFile("file")
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "no file uploaded"})
	}

	if !strings.HasSuffix(strings.ToLower(file.Filename), ".3mf") {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "only .3mf files are allowed"})
	}

	subdir := c.FormValue("subdir")
	if subdir == "" {
		subdir = "items/f"
	}

	destDir := filepath.Join(h.DataDir, "models", subdir)
	if err := os.MkdirAll(destDir, 0755); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to create directory"})
	}

	src, err := file.Open()
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to open file"})
	}
	defer src.Close()

	destPath := filepath.Join(destDir, file.Filename)
	dst, err := os.Create(destPath)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to save file"})
	}
	defer dst.Close()

	if _, err := io.Copy(dst, src); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to write file"})
	}

	relativePath := fmt.Sprintf("models/%s/%s", subdir, file.Filename)
	return c.JSON(http.StatusOK, map[string]string{
		"path":     relativePath,
		"filename": file.Filename,
	})
}

func (h *UploadHandler) UploadImage(c echo.Context) error {
	file, err := c.FormFile("file")
	if err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "no file uploaded"})
	}

	ext := strings.ToLower(filepath.Ext(file.Filename))
	if ext != ".png" && ext != ".jpg" && ext != ".jpeg" && ext != ".webp" {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "only image files are allowed"})
	}

	subdir := c.FormValue("subdir")
	if subdir == "" {
		subdir = "items/f"
	}

	destDir := filepath.Join(h.DataDir, "images", subdir)
	if err := os.MkdirAll(destDir, 0755); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to create directory"})
	}

	src, err := file.Open()
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to open file"})
	}
	defer src.Close()

	destPath := filepath.Join(destDir, file.Filename)
	dst, err := os.Create(destPath)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to save file"})
	}
	defer dst.Close()

	if _, err := io.Copy(dst, src); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": "failed to write file"})
	}

	relativePath := fmt.Sprintf("images/%s/%s", subdir, file.Filename)
	return c.JSON(http.StatusOK, map[string]string{
		"path":     relativePath,
		"filename": file.Filename,
	})
}
