package main

import (
	"fmt"
	"log"
	"os"

	"github.com/Mr9esx/RiSu/server/internal/config"
	"github.com/Mr9esx/RiSu/server/internal/database"
	"github.com/Mr9esx/RiSu/server/internal/geo"
	"github.com/Mr9esx/RiSu/server/internal/handler"
	"github.com/Mr9esx/RiSu/server/internal/middleware"
	"github.com/Mr9esx/RiSu/server/internal/model"
	"github.com/Mr9esx/RiSu/server/internal/publisher"
	"github.com/Mr9esx/RiSu/server/internal/seeder"
	"github.com/Mr9esx/RiSu/server/internal/service"
	"github.com/labstack/echo/v4"
	echoMiddleware "github.com/labstack/echo/v4/middleware"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

func main() {
	configPath := os.Getenv("RISU_CONFIG")
	if configPath == "" {
		configPath = "config.yaml"
	}
	cfg, err := config.Load(configPath)
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	db, err := database.Open(cfg.Database.Path)
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}

	ensureAdminUser(db, cfg)
	seeder.SeedIfEmpty(db, cfg.Storage.PublishDir, cfg.Storage.DataDir)

	productSvc := &service.ProductService{DB: db}
	categorySvc := &service.CategoryService{DB: db}
	presetSvc := &service.PresetService{DB: db}
	releaseSvc := &service.ReleaseService{DB: db}

	productHandler := &handler.ProductHandler{Service: productSvc, DB: db}
	categoryHandler := &handler.CategoryHandler{Service: categorySvc}
	presetHandler := &handler.PresetHandler{Service: presetSvc}
	authHandler := &handler.AuthHandler{DB: db, JWTSecret: cfg.Server.JWTSecret}
	uploadHandler := &handler.UploadHandler{DataDir: cfg.Storage.DataDir}
	pub := &publisher.Publisher{DB: db, DataDir: cfg.Storage.DataDir, PublishDir: cfg.Storage.PublishDir}
	publishHandler := &handler.PublishHandler{
		Publisher:      pub,
		ReleaseService: releaseSvc,
		ArtifactPath:   cfg.Storage.PublishDir,
	}
	releaseHandler := &handler.ReleaseHandler{Service: releaseSvc}
	analyticsHandler := &handler.AnalyticsHandler{DB: db, Resolver: geo.NewResolver()}

	e := echo.New()
	e.Use(echoMiddleware.Logger())
	e.Use(echoMiddleware.Recover())
	e.Use(echoMiddleware.CORSWithConfig(echoMiddleware.CORSConfig{
		AllowOrigins: []string{"http://localhost:4180", "http://localhost:4181"},
		AllowMethods: []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders: []string{"Content-Type", "Authorization"},
	}))

	// Public API (frontend consumption)
	public := e.Group("/api/v1")
	public.GET("/blocks", func(c echo.Context) error {
		c.QueryParams().Set("type", "block")
		return productHandler.PublicList(c)
	})
	public.GET("/items", func(c echo.Context) error {
		c.QueryParams().Set("type", "item")
		return productHandler.PublicList(c)
	})
	public.GET("/risers", func(c echo.Context) error {
		c.QueryParams().Set("type", "riser")
		return productHandler.PublicList(c)
	})
	public.GET("/categories", categoryHandler.PublicList)
	public.GET("/presets", presetHandler.PublicList)
	public.POST("/track", analyticsHandler.Track)

	// Auth
	auth := e.Group("/api/v1/auth")
	auth.POST("/login", authHandler.Login)

	// Admin API (requires authentication)
	admin := e.Group("/api/v1/admin", middleware.AuthRequired(cfg.Server.JWTSecret))
	admin.GET("/me", authHandler.Me)

	admin.GET("/products", productHandler.List)
	admin.POST("/products", productHandler.Create)
	admin.GET("/products/:sku", productHandler.Get)
	admin.PUT("/products/:sku", productHandler.Update)
	admin.DELETE("/products/:sku", productHandler.Delete)

	admin.GET("/categories", categoryHandler.List)
	admin.POST("/categories", categoryHandler.Create)
	admin.GET("/categories/:id", categoryHandler.Get)
	admin.PUT("/categories/:id", categoryHandler.Update)
	admin.DELETE("/categories/:id", categoryHandler.Delete)
	admin.PUT("/categories/sort", categoryHandler.Sort)

	admin.GET("/presets", presetHandler.List)
	admin.POST("/presets", presetHandler.Create)
	admin.GET("/presets/:id", presetHandler.Get)
	admin.PUT("/presets/:id", presetHandler.Update)
	admin.DELETE("/presets/:id", presetHandler.Delete)

	admin.POST("/upload/model", uploadHandler.UploadModel)
	admin.POST("/upload/image", uploadHandler.UploadImage)

	admin.GET("/publish/preview", publishHandler.Preview)
	admin.POST("/publish", publishHandler.Publish)

	admin.GET("/releases", releaseHandler.List)
	admin.GET("/releases/rollbacks", releaseHandler.ListRollbacks)
	admin.POST("/releases", releaseHandler.Upsert)
	admin.POST("/releases/rollbacks", releaseHandler.RecordRollback)
	admin.GET("/releases/:release_id", releaseHandler.Get)
	admin.GET("/analytics/overview", analyticsHandler.Overview)

	// Serve uploaded files for admin preview
	e.Static("/files", cfg.Storage.DataDir)

	addr := fmt.Sprintf(":%d", cfg.Server.Port)
	log.Printf("Server starting on %s", addr)
	log.Fatal(e.Start(addr))
}

func ensureAdminUser(db *gorm.DB, cfg *config.Config) {
	var count int64
	db.Model(&model.User{}).Count(&count)
	if count > 0 {
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
