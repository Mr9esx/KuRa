package service

import (
	"github.com/Mr9esx/RiSu/server/internal/model"
	"gorm.io/gorm"
)

type ProductService struct {
	DB *gorm.DB
}

func (s *ProductService) List(productType string, publishedOnly bool) ([]model.Product, error) {
	var products []model.Product
	q := s.DB.Order("sort_order ASC, sku ASC")
	if productType != "" {
		q = q.Where("type = ?", productType)
	}
	if publishedOnly {
		q = q.Where("is_published = ?", true)
	}
	return products, q.Find(&products).Error
}

func (s *ProductService) GetBySKU(sku string) (*model.Product, error) {
	var product model.Product
	err := s.DB.Where("sku = ?", sku).First(&product).Error
	if err != nil {
		return nil, err
	}
	return &product, nil
}

func (s *ProductService) Create(product *model.Product) error {
	return s.DB.Create(product).Error
}

func (s *ProductService) Update(sku string, updates map[string]interface{}) (*model.Product, error) {
	var product model.Product
	if err := s.DB.Where("sku = ?", sku).First(&product).Error; err != nil {
		return nil, err
	}
	if err := s.DB.Model(&product).Updates(updates).Error; err != nil {
		return nil, err
	}
	return &product, nil
}

func (s *ProductService) Delete(sku string) error {
	return s.DB.Where("sku = ?", sku).Delete(&model.Product{}).Error
}
