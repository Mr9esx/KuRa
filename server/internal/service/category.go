package service

import (
	"github.com/Mr9esx/RiSu/server/internal/model"
	"gorm.io/gorm"
)

type CategoryService struct {
	DB *gorm.DB
}

type CategoryWithProducts struct {
	model.Category
	Products []model.CategoryProduct `json:"products"`
}

func (s *CategoryService) List(categoryType string) ([]CategoryWithProducts, error) {
	var categories []model.Category
	q := s.DB.Order("sort_order ASC, name ASC")
	if categoryType != "" {
		q = q.Where("type = ?", categoryType)
	}
	if err := q.Find(&categories).Error; err != nil {
		return nil, err
	}

	result := make([]CategoryWithProducts, len(categories))
	for i, cat := range categories {
		var products []model.CategoryProduct
		s.DB.Where("category_id = ?", cat.ID).Order("sort_order ASC").Find(&products)
		result[i] = CategoryWithProducts{Category: cat, Products: products}
	}
	return result, nil
}

func (s *CategoryService) GetByID(id uint) (*CategoryWithProducts, error) {
	var cat model.Category
	if err := s.DB.First(&cat, id).Error; err != nil {
		return nil, err
	}
	var products []model.CategoryProduct
	s.DB.Where("category_id = ?", cat.ID).Order("sort_order ASC").Find(&products)
	return &CategoryWithProducts{Category: cat, Products: products}, nil
}

func (s *CategoryService) Create(cat *model.Category) error {
	return s.DB.Create(cat).Error
}

func (s *CategoryService) Update(id uint, name string, sortOrder int) (*model.Category, error) {
	var cat model.Category
	if err := s.DB.First(&cat, id).Error; err != nil {
		return nil, err
	}
	cat.Name = name
	cat.SortOrder = sortOrder
	if err := s.DB.Save(&cat).Error; err != nil {
		return nil, err
	}
	return &cat, nil
}

func (s *CategoryService) Delete(id uint) error {
	s.DB.Where("category_id = ?", id).Delete(&model.CategoryProduct{})
	return s.DB.Delete(&model.Category{}, id).Error
}

func (s *CategoryService) UpdateProducts(categoryID uint, skus []string) error {
	s.DB.Where("category_id = ?", categoryID).Delete(&model.CategoryProduct{})
	for i, sku := range skus {
		cp := model.CategoryProduct{
			CategoryID: categoryID,
			ProductSKU: sku,
			SortOrder:  i + 1,
		}
		if err := s.DB.Create(&cp).Error; err != nil {
			return err
		}
	}
	return nil
}

func (s *CategoryService) BatchUpdateSort(updates []struct {
	ID        uint `json:"id"`
	SortOrder int  `json:"sort_order"`
}) error {
	for _, u := range updates {
		s.DB.Model(&model.Category{}).Where("id = ?", u.ID).Update("sort_order", u.SortOrder)
	}
	return nil
}
