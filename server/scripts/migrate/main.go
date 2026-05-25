package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"

	"github.com/Mr9esx/RiSu/server/internal/config"
	"github.com/Mr9esx/RiSu/server/internal/database"
	"github.com/Mr9esx/RiSu/server/internal/model"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type RawBlock struct {
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

type RawItem struct {
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

type RawCategoryItem struct {
	Name   string   `json:"name"`
	Order  int      `json:"order"`
	Items  []string `json:"items"`
	Risers []string `json:"risers"`
}

type RawCategoryBlock struct {
	Name   string   `json:"name"`
	Order  int      `json:"order"`
	Blocks []string `json:"blocks"`
}

type RawPreset struct {
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

func main() {
	cfg, err := config.Load("config.yaml")
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	db, err := database.Open(cfg.Database.Path)
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}

	publicDir := cfg.Storage.PublishDir
	dataDir := cfg.Storage.DataDir

	log.Println("=== Starting migration ===")

	migrateBlocks(db, publicDir)
	migrateItems(db, publicDir)
	migrateRisers(db, publicDir)
	migrateItemCategories(db, publicDir)
	migrateBlockCategories(db, publicDir)
	migratePresets(db, publicDir)
	copyFiles(publicDir, dataDir)
	createAdminUser(db, cfg)

	log.Println("=== Migration complete ===")
}

func migrateBlocks(db *gorm.DB, publicDir string) {
	data, err := os.ReadFile(filepath.Join(publicDir, "data", "blocks.json"))
	if err != nil {
		log.Fatalf("Failed to read blocks.json: %v", err)
	}

	var blocks []RawBlock
	if err := json.Unmarshal(data, &blocks); err != nil {
		log.Fatalf("Failed to parse blocks.json: %v", err)
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
			log.Printf("  WARN: block %s: %v", b.SKU, err)
		} else {
			log.Printf("  Block: %s (%s)", b.SKU, b.DisplayName)
		}
	}
	log.Printf("Migrated %d blocks", len(blocks))
}

func migrateItems(db *gorm.DB, publicDir string) {
	data, err := os.ReadFile(filepath.Join(publicDir, "data", "items.json"))
	if err != nil {
		log.Fatalf("Failed to read items.json: %v", err)
	}

	var items []RawItem
	if err := json.Unmarshal(data, &items); err != nil {
		log.Fatalf("Failed to parse items.json: %v", err)
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
			log.Printf("  WARN: item %s: %v", item.SKU, err)
		} else {
			log.Printf("  Item: %s (%s)", item.SKU, item.DisplayName)
		}
	}
	log.Printf("Migrated %d items", len(items))
}

func migrateRisers(db *gorm.DB, publicDir string) {
	data, err := os.ReadFile(filepath.Join(publicDir, "data", "risers.json"))
	if err != nil {
		log.Fatalf("Failed to read risers.json: %v", err)
	}

	var risers []RawItem
	if err := json.Unmarshal(data, &risers); err != nil {
		log.Fatalf("Failed to parse risers.json: %v", err)
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
			log.Printf("  WARN: riser %s: %v", r.SKU, err)
		} else {
			log.Printf("  Riser: %s (%s)", r.SKU, r.DisplayName)
		}
	}
	log.Printf("Migrated %d risers", len(risers))
}

func migrateItemCategories(db *gorm.DB, publicDir string) {
	data, err := os.ReadFile(filepath.Join(publicDir, "data", "categories-items.json"))
	if err != nil {
		log.Fatalf("Failed to read categories-items.json: %v", err)
	}

	var categories []RawCategoryItem
	if err := json.Unmarshal(data, &categories); err != nil {
		log.Fatalf("Failed to parse categories-items.json: %v", err)
	}

	for _, cat := range categories {
		category := model.Category{
			Name:      cat.Name,
			Type:      "item",
			SortOrder: cat.Order,
		}
		if err := db.Create(&category).Error; err != nil {
			log.Printf("  WARN: category %s: %v", cat.Name, err)
			continue
		}

		sortOrder := 1
		for _, sku := range cat.Items {
			cp := model.CategoryProduct{
				CategoryID: category.ID,
				ProductSKU: sku,
				SortOrder:  sortOrder,
			}
			db.Create(&cp)
			sortOrder++
		}
		for _, sku := range cat.Risers {
			cp := model.CategoryProduct{
				CategoryID: category.ID,
				ProductSKU: sku,
				SortOrder:  sortOrder,
			}
			db.Create(&cp)
			sortOrder++
		}
		log.Printf("  Category (item): %s (%d items, %d risers)", cat.Name, len(cat.Items), len(cat.Risers))
	}
	log.Printf("Migrated %d item categories", len(categories))
}

func migrateBlockCategories(db *gorm.DB, publicDir string) {
	data, err := os.ReadFile(filepath.Join(publicDir, "data", "categories-blocks.json"))
	if err != nil {
		log.Fatalf("Failed to read categories-blocks.json: %v", err)
	}

	var categories []RawCategoryBlock
	if err := json.Unmarshal(data, &categories); err != nil {
		log.Fatalf("Failed to parse categories-blocks.json: %v", err)
	}

	for _, cat := range categories {
		category := model.Category{
			Name:      cat.Name,
			Type:      "block",
			SortOrder: cat.Order,
		}
		if err := db.Create(&category).Error; err != nil {
			log.Printf("  WARN: category %s: %v", cat.Name, err)
			continue
		}

		for i, sku := range cat.Blocks {
			cp := model.CategoryProduct{
				CategoryID: category.ID,
				ProductSKU: sku,
				SortOrder:  i + 1,
			}
			db.Create(&cp)
		}
		log.Printf("  Category (block): %s (%d blocks)", cat.Name, len(cat.Blocks))
	}
	log.Printf("Migrated %d block categories", len(categories))
}

func migratePresets(db *gorm.DB, publicDir string) {
	data, err := os.ReadFile(filepath.Join(publicDir, "data", "presets.json"))
	if err != nil {
		log.Printf("WARN: presets.json not found, skipping")
		return
	}

	var presets []RawPreset
	if err := json.Unmarshal(data, &presets); err != nil {
		log.Fatalf("Failed to parse presets.json: %v", err)
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
			log.Printf("  WARN: preset %s: %v", p.ID, err)
			continue
		}

		for _, item := range p.Items {
			pi := model.PresetItem{
				PresetID:   preset.ID,
				ProductSKU: item.SKU,
				CellX:      item.Cell[0],
				CellY:      item.Cell[1],
			}
			db.Create(&pi)
		}
		log.Printf("  Preset: %s (%d items)", p.Name, len(p.Items))
	}
	log.Printf("Migrated %d presets", len(presets))
}

func copyFiles(publicDir, dataDir string) {
	dirs := []struct {
		src string
		dst string
	}{
		{filepath.Join(publicDir, "models"), filepath.Join(dataDir, "models")},
		{filepath.Join(publicDir, "images", "block"), filepath.Join(dataDir, "images", "block")},
		{filepath.Join(publicDir, "images", "items"), filepath.Join(dataDir, "images", "items")},
	}

	totalCopied := 0
	for _, d := range dirs {
		if _, err := os.Stat(d.src); os.IsNotExist(err) {
			log.Printf("  SKIP: %s does not exist", d.src)
			continue
		}

		err := filepath.Walk(d.src, func(path string, info os.FileInfo, err error) error {
			if err != nil || info.IsDir() {
				return err
			}

			relPath, _ := filepath.Rel(d.src, path)
			dstPath := filepath.Join(d.dst, relPath)

			if err := os.MkdirAll(filepath.Dir(dstPath), 0755); err != nil {
				return err
			}

			if err := copyFileHelper(path, dstPath); err != nil {
				return fmt.Errorf("copy %s -> %s: %w", path, dstPath, err)
			}
			totalCopied++
			return nil
		})
		if err != nil {
			log.Printf("  WARN: error copying %s: %v", d.src, err)
		}
	}
	log.Printf("Copied %d files to data directory", totalCopied)
}

func copyFileHelper(src, dst string) error {
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

func createAdminUser(db *gorm.DB, cfg *config.Config) {
	var count int64
	db.Model(&model.User{}).Count(&count)
	if count > 0 {
		log.Println("Admin user already exists, skipping")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(cfg.Auth.Password), bcrypt.DefaultCost)
	if err != nil {
		log.Fatalf("Failed to hash password: %v", err)
	}

	user := model.User{
		Username:     cfg.Auth.Username,
		PasswordHash: string(hash),
	}
	if err := db.Create(&user).Error; err != nil {
		log.Fatalf("Failed to create admin user: %v", err)
	}
	log.Printf("Created admin user: %s", cfg.Auth.Username)
}

