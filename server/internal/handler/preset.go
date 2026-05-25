package handler

import (
	"net/http"
	"strconv"

	"github.com/Mr9esx/RiSu/server/internal/model"
	"github.com/Mr9esx/RiSu/server/internal/service"
	"github.com/labstack/echo/v4"
)

type PresetHandler struct {
	Service *service.PresetService
}

func (h *PresetHandler) List(c echo.Context) error {
	presets, err := h.Service.List(false)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	return c.JSON(http.StatusOK, presets)
}

func (h *PresetHandler) PublicList(c echo.Context) error {
	presets, err := h.Service.List(true)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}

	result := make([]map[string]interface{}, 0, len(presets))
	for _, p := range presets {
		items := make([]map[string]interface{}, 0, len(p.Items))
		for _, item := range p.Items {
			items = append(items, map[string]interface{}{
				"sku":  item.ProductSKU,
				"cell": []int{item.CellX, item.CellY},
			})
		}
		result = append(result, map[string]interface{}{
			"id":          p.PresetID,
			"name":        p.Name,
			"description": p.Description,
			"image":       p.Image,
			"blockSku":    p.BlockSKU,
			"items":       items,
		})
	}
	return c.JSON(http.StatusOK, result)
}

func (h *PresetHandler) Get(c echo.Context) error {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
	preset, err := h.Service.GetByID(uint(id))
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "preset not found"})
	}
	return c.JSON(http.StatusOK, preset)
}

func (h *PresetHandler) Create(c echo.Context) error {
	var preset model.Preset
	if err := c.Bind(&preset); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}
	if err := h.Service.Create(&preset); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	return c.JSON(http.StatusCreated, preset)
}

func (h *PresetHandler) Update(c echo.Context) error {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
	var preset model.Preset
	if err := c.Bind(&preset); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}
	if err := h.Service.Update(uint(id), &preset); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	return c.JSON(http.StatusOK, preset)
}

func (h *PresetHandler) Delete(c echo.Context) error {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
	if err := h.Service.Delete(uint(id)); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	return c.JSON(http.StatusNoContent, nil)
}
