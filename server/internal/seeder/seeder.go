package seeder

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"

	"github.com/Mr9esx/RiSu/server/internal/model"
	"gorm.io/gorm"
)

type rawBlock struct {
	SKU                string     `json:"sku"`
	DisplayName        string     `json:"display_name"`
	Name               string     `json:"name"`
	Type               string     `json:"type"`
	Categories         []string   `json:"categories"`
	GridSize           [2]int     `json:"gridSize"`
	Height             int        `json:"height"`
	InnerSize          [2]int     `json:"innerSize"`
	CellGrid           [2]int     `json:"cellGrid"`
	ImagePath          string     `json:"imagePath"`
	ModelPath          string     `json:"modelPath"`
	ModelRotation      [3]float64 `json:"modelRotation"`
	ModelBackHookDepth *int       `json:"modelBackHookDepth"`
}

type rawItem struct {
	SKU           string     `json:"sku"`
	SKUName       string     `json:"sku_name"`
	DisplayName   string     `json:"display_name"`
	Desc          string     `json:"desc"`
	Order         int        `json:"order"`
	Type          string     `json:"type"`
	Categories    []string   `json:"categories"`
	GridSize      [2]int     `json:"gridSize"`
	Height        int        `json:"height"`
	ImagePath     string     `json:"imagePath"`
	ModelPath     string     `json:"modelPath"`
	ModelRotation [3]float64 `json:"modelRotation"`
}

type rawCategoryItem struct {
	Name   string   `json:"name"`
	Order  int      `json:"order"`
	Items  []string `json:"items"`
	Risers []string `json:"risers"`
}

type rawCategoryBlock struct {
	Name   string   `json:"name"`
	Order  int      `json:"order"`
	Blocks []string `json:"blocks"`
}

type rawPreset struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Image       string `json:"image"`
	BlockSKU    string `json:"blockSku"`
	Items       []struct {
		SKU  string `json:"sku"`
		Cell [2]int `json:"cell"`
	} `json:"items"`
}

// SeedIfEmpty checks whether the database has product data.
// If the products table is empty, it imports catalog data from JSON files
// in publishDir and copies model/image assets to dataDir.
func SeedIfEmpty(db *gorm.DB, publishDir, dataDir string) {
	var count int64
	db.Model(&model.Product{}).Count(&count)
	if count > 0 {
		return
	}

	dataPath := filepath.Join(publishDir, "data")
	if _, err := os.Stat(dataPath); os.IsNotExist(err) {
		log.Printf("[seeder] No data directory at %s, skipping auto-seed", dataPath)
		return
	}

	log.Println("[seeder] Database is empty, auto-seeding from JSON files...")

	seedBlocks(db, publishDir)
	seedItems(db, publishDir)
	seedRisers(db, publishDir)
	seedItemCategories(db, publishDir)
	seedBlockCategories(db, publishDir)
	seedPresets(db, publishDir)
	copyAssets(publishDir, dataDir)

	log.Println("[seeder] Auto-seed complete")
}

func seedBlocks(db *gorm.DB, publishDir string) {
	data, err := os.ReadFile(filepath.Join(publishDir, "data", "blocks.json"))
	if err != nil {
		log.Printf("[seeder] WARN: cannot read blocks.json: %v", err)
		return
	}

	var blocks []rawBlock
	if err := json.Unmarshal(data, &blocks); err != nil {
		log.Printf("[seeder] WARN: cannot parse blocks.json: %v", err)
		return
	}

	for i, b := range blocks {
		innerW := b.InnerSize[0]
		innerD := b.InnerSize[1]
		cellC := b.CellGrid[0]
		cellR := b.CellGrid[1]

		product := model.Product{
			SKU:                b.SKU,
			SKUName:            b.Name,
			DisplayName:        b.DisplayName,
			Type:               "block",
			GridCols:           b.GridSize[0],
			GridRows:           b.GridSize[1],
			Height:             b.Height,
			InnerWidth:         &innerW,
			InnerDepth:         &innerD,
			CellCols:           &cellC,
			CellRows:           &cellR,
			ModelBackHookDepth: b.ModelBackHookDepth,
			ImagePath:          b.ImagePath,
			ModelPath:          b.ModelPath,
			ModelRotationX:     b.ModelRotation[0],
			ModelRotationY:     b.ModelRotation[1],
			ModelRotationZ:     b.ModelRotation[2],
			SortOrder:          i + 1,
			IsPublished:        true,
		}
		if err := db.Create(&product).Error; err != nil {
			log.Printf("[seeder] WARN: block %s: %v", b.SKU, err)
		}
	}
	log.Printf("[seeder] Seeded %d blocks", len(blocks))
}

func seedItems(db *gorm.DB, publishDir string) {
	data, err := os.ReadFile(filepath.Join(publishDir, "data", "items.json"))
	if err != nil {
		log.Printf("[seeder] WARN: cannot read items.json: %v", err)
		return
	}

	var items []rawItem
	if err := json.Unmarshal(data, &items); err != nil {
		log.Printf("[seeder] WARN: cannot parse items.json: %v", err)
		return
	}

	for i, item := range items {
		order := item.Order
		if order == 0 {
			order = i + 1
		}
		product := model.Product{
			SKU:            item.SKU,
			SKUName:        item.SKUName,
			DisplayName:    item.DisplayName,
			Desc:           item.Desc,
			Type:           "item",
			GridCols:       item.GridSize[0],
			GridRows:       item.GridSize[1],
			Height:         item.Height,
			ImagePath:      item.ImagePath,
			ModelPath:      item.ModelPath,
			ModelRotationX: item.ModelRotation[0],
			ModelRotationY: item.ModelRotation[1],
			ModelRotationZ: item.ModelRotation[2],
			SortOrder:      order,
			IsPublished:    true,
		}
		if err := db.Create(&product).Error; err != nil {
			log.Printf("[seeder] WARN: item %s: %v", item.SKU, err)
		}
	}
	log.Printf("[seeder] Seeded %d items", len(items))
}

func seedRisers(db *gorm.DB, publishDir string) {
	data, err := os.ReadFile(filepath.Join(publishDir, "data", "risers.json"))
	if err != nil {
		log.Printf("[seeder] WARN: cannot read risers.json: %v", err)
		return
	}

	var risers []rawItem
	if err := json.Unmarshal(data, &risers); err != nil {
		log.Printf("[seeder] WARN: cannot parse risers.json: %v", err)
		return
	}

	for i, r := range risers {
		order := r.Order
		if order == 0 {
			order = i + 1
		}
		product := model.Product{
			SKU:            r.SKU,
			SKUName:        r.SKUName,
			DisplayName:    r.DisplayName,
			Desc:           r.Desc,
			Type:           "riser",
			GridCols:       r.GridSize[0],
			GridRows:       r.GridSize[1],
			Height:         r.Height,
			ImagePath:      r.ImagePath,
			ModelPath:      r.ModelPath,
			ModelRotationX: r.ModelRotation[0],
			ModelRotationY: r.ModelRotation[1],
			ModelRotationZ: r.ModelRotation[2],
			SortOrder:      order,
			IsPublished:    true,
		}
		if err := db.Create(&product).Error; err != nil {
			log.Printf("[seeder] WARN: riser %s: %v", r.SKU, err)
		}
	}
	log.Printf("[seeder] Seeded %d risers", len(risers))
}

func seedItemCategories(db *gorm.DB, publishDir string) {
	data, err := os.ReadFile(filepath.Join(publishDir, "data", "categories-items.json"))
	if err != nil {
		log.Printf("[seeder] WARN: cannot read categories-items.json: %v", err)
		return
	}

	var categories []rawCategoryItem
	if err := json.Unmarshal(data, &categories); err != nil {
		log.Printf("[seeder] WARN: cannot parse categories-items.json: %v", err)
		return
	}

	for _, cat := range categories {
		category := model.Category{
			Name:      cat.Name,
			Type:      "item",
			SortOrder: cat.Order,
		}
		if err := db.Create(&category).Error; err != nil {
			log.Printf("[seeder] WARN: category %s: %v", cat.Name, err)
			continue
		}

		sortOrder := 1
		for _, sku := range cat.Items {
			db.Create(&model.CategoryProduct{
				CategoryID: category.ID,
				ProductSKU: sku,
				SortOrder:  sortOrder,
			})
			sortOrder++
		}
		for _, sku := range cat.Risers {
			db.Create(&model.CategoryProduct{
				CategoryID: category.ID,
				ProductSKU: sku,
				SortOrder:  sortOrder,
			})
			sortOrder++
		}
	}
	log.Printf("[seeder] Seeded %d item categories", len(categories))
}

func seedBlockCategories(db *gorm.DB, publishDir string) {
	data, err := os.ReadFile(filepath.Join(publishDir, "data", "categories-blocks.json"))
	if err != nil {
		log.Printf("[seeder] WARN: cannot read categories-blocks.json: %v", err)
		return
	}

	var categories []rawCategoryBlock
	if err := json.Unmarshal(data, &categories); err != nil {
		log.Printf("[seeder] WARN: cannot parse categories-blocks.json: %v", err)
		return
	}

	for _, cat := range categories {
		category := model.Category{
			Name:      cat.Name,
			Type:      "block",
			SortOrder: cat.Order,
		}
		if err := db.Create(&category).Error; err != nil {
			log.Printf("[seeder] WARN: category %s: %v", cat.Name, err)
			continue
		}

		for i, sku := range cat.Blocks {
			db.Create(&model.CategoryProduct{
				CategoryID: category.ID,
				ProductSKU: sku,
				SortOrder:  i + 1,
			})
		}
	}
	log.Printf("[seeder] Seeded %d block categories", len(categories))
}

func seedPresets(db *gorm.DB, publishDir string) {
	data, err := os.ReadFile(filepath.Join(publishDir, "data", "presets.json"))
	if err != nil {
		log.Printf("[seeder] WARN: presets.json not found, skipping")
		return
	}

	var presets []rawPreset
	if err := json.Unmarshal(data, &presets); err != nil {
		log.Printf("[seeder] WARN: cannot parse presets.json: %v", err)
		return
	}

	for _, p := range presets {
		preset := model.Preset{
			PresetID:    p.ID,
			Name:        p.Name,
			Description: p.Description,
			Image:       p.Image,
			BlockSKU:    p.BlockSKU,
			IsPublished: true,
		}
		if err := db.Create(&preset).Error; err != nil {
			log.Printf("[seeder] WARN: preset %s: %v", p.ID, err)
			continue
		}

		for _, item := range p.Items {
			db.Create(&model.PresetItem{
				PresetID:   preset.ID,
				ProductSKU: item.SKU,
				CellX:      item.Cell[0],
				CellY:      item.Cell[1],
			})
		}
	}
	log.Printf("[seeder] Seeded %d presets", len(presets))
}

func copyAssets(publishDir, dataDir string) {
	dirs := []struct{ src, dst string }{
		{filepath.Join(publishDir, "models"), filepath.Join(dataDir, "models")},
		{filepath.Join(publishDir, "images", "block"), filepath.Join(dataDir, "images", "block")},
		{filepath.Join(publishDir, "images", "items"), filepath.Join(dataDir, "images", "items")},
	}

	total := 0
	for _, d := range dirs {
		if _, err := os.Stat(d.src); os.IsNotExist(err) {
			continue
		}

		filepath.Walk(d.src, func(path string, info os.FileInfo, err error) error {
			if err != nil || info.IsDir() {
				return err
			}

			relPath, _ := filepath.Rel(d.src, path)
			dstPath := filepath.Join(d.dst, relPath)

			if err := os.MkdirAll(filepath.Dir(dstPath), 0755); err != nil {
				return err
			}

			if err := copyFile(path, dstPath); err != nil {
				return fmt.Errorf("copy %s -> %s: %w", path, dstPath, err)
			}
			total++
			return nil
		})
	}
	log.Printf("[seeder] Copied %d asset files to data directory", total)
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, in)
	return err
}
