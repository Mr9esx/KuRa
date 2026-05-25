package config

import (
	"os"

	"gopkg.in/yaml.v3"
)

type ServerConfig struct {
	Port      int    `yaml:"port"`
	JWTSecret string `yaml:"jwt_secret"`
}

type DatabaseConfig struct {
	Path string `yaml:"path"`
}

type StorageConfig struct {
	DataDir    string `yaml:"data_dir"`
	PublishDir string `yaml:"publish_dir"`
}

type AuthConfig struct {
	Username string `yaml:"username"`
	Password string `yaml:"password"`
}

type Config struct {
	Server   ServerConfig   `yaml:"server"`
	Database DatabaseConfig `yaml:"database"`
	Storage  StorageConfig  `yaml:"storage"`
	Auth     AuthConfig     `yaml:"auth"`
}

func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	cfg := &Config{
		Server: ServerConfig{
			Port:      8080,
			JWTSecret: "change-me-in-production",
		},
		Database: DatabaseConfig{
			Path: "./data/risu.db",
		},
		Storage: StorageConfig{
			DataDir:    "./data",
			PublishDir: "../app/public",
		},
		Auth: AuthConfig{
			Username: "admin",
			Password: "admin123",
		},
	}

	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, err
	}

	return cfg, nil
}
