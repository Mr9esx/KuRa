package handler

import (
	"net/http"
	"strconv"

	"github.com/Mr9esx/RiSu/server/internal/model"
	"github.com/Mr9esx/RiSu/server/internal/service"
	"github.com/labstack/echo/v4"
)

type CategoryHandler struct {
	Service *service.CategoryService
}

func (h *CategoryHandler) List(c echo.Context) error {
	categoryType := c.QueryParam("type")
	categories, err := h.Service.List(categoryType)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	return c.JSON(http.StatusOK, categories)
}

func (h *CategoryHandler) PublicList(c echo.Context) error {
	categoryType := c.QueryParam("type")
	categories, err := h.Service.List(categoryType)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}

	result := make([]map[string]interface{}, 0, len(categories))
	for _, cat := range categories {
		entry := map[string]interface{}{
			"name":  cat.Name,
			"order": cat.SortOrder,
		}
		if cat.Type == "block" {
			skus := make([]string, 0, len(cat.Products))
			for _, cp := range cat.Products {
				skus = append(skus, cp.ProductSKU)
			}
			entry["blocks"] = skus
		} else {
			items := make([]string, 0)
			risers := make([]string, 0)
			for _, cp := range cat.Products {
				if len(cp.ProductSKU) > 0 && cp.ProductSKU[0] == '3' {
					risers = append(risers, cp.ProductSKU)
				} else {
					items = append(items, cp.ProductSKU)
				}
			}
			entry["items"] = items
			entry["risers"] = risers
		}
		result = append(result, entry)
	}
	return c.JSON(http.StatusOK, result)
}

func (h *CategoryHandler) Get(c echo.Context) error {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
	cat, err := h.Service.GetByID(uint(id))
	if err != nil {
		return c.JSON(http.StatusNotFound, map[string]string{"error": "category not found"})
	}
	return c.JSON(http.StatusOK, cat)
}

func (h *CategoryHandler) Create(c echo.Context) error {
	var cat model.Category
	if err := c.Bind(&cat); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}
	if err := h.Service.Create(&cat); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	return c.JSON(http.StatusCreated, cat)
}

type UpdateCategoryRequest struct {
	Name      string   `json:"name"`
	SortOrder int      `json:"sort_order"`
	Products  []string `json:"products"`
}

func (h *CategoryHandler) Update(c echo.Context) error {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
	var req UpdateCategoryRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	cat, err := h.Service.Update(uint(id), req.Name, req.SortOrder)
	if err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}

	if req.Products != nil {
		if err := h.Service.UpdateProducts(uint(id), req.Products); err != nil {
			return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
		}
	}

	return c.JSON(http.StatusOK, cat)
}

func (h *CategoryHandler) Delete(c echo.Context) error {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
	if err := h.Service.Delete(uint(id)); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	return c.JSON(http.StatusNoContent, nil)
}

type SortRequest struct {
	Items []struct {
		ID        uint `json:"id"`
		SortOrder int  `json:"sort_order"`
	} `json:"items"`
}

func (h *CategoryHandler) Sort(c echo.Context) error {
	var req SortRequest
	if err := c.Bind(&req); err != nil {
		return c.JSON(http.StatusBadRequest, map[string]string{"error": "invalid request"})
	}

	updates := make([]struct {
		ID        uint `json:"id"`
		SortOrder int  `json:"sort_order"`
	}, len(req.Items))
	copy(updates, req.Items)

	if err := h.Service.BatchUpdateSort(updates); err != nil {
		return c.JSON(http.StatusInternalServerError, map[string]string{"error": err.Error()})
	}
	return c.JSON(http.StatusOK, map[string]string{"status": "ok"})
}
