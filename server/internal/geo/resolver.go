package geo

import (
	_ "embed"
	"encoding/json"
	"net"
	"net/netip"
	"os"
	"path/filepath"
	"strings"

	"github.com/oschwald/maxminddb-golang"
)

//go:embed geoip-lite.json
var geoLiteRaw []byte

type GeoInfo struct {
	Country string
	Region  string
	City    string
	Lat     float64
	Lng     float64
}

type Resolver struct {
	db      *maxminddb.Reader
	entries []entry
}

type entry struct {
	prefix  netip.Prefix
	country string
	region  string
	city    string
	lat     float64
	lng     float64
}

type rawEntry struct {
	CIDR    string  `json:"cidr"`
	Country string  `json:"country"`
	Region  string  `json:"region"`
	City    string  `json:"city"`
	Lat     float64 `json:"lat"`
	Lng     float64 `json:"lng"`
}

func NewResolver(mmdbPath ...string) *Resolver {
	var reader *maxminddb.Reader
	if len(mmdbPath) > 0 && mmdbPath[0] != "" {
		reader = openMMDBAt(mmdbPath[0])
	}
	if reader == nil {
		reader = openMMDB()
	}

	var raws []rawEntry
	if err := json.Unmarshal(geoLiteRaw, &raws); err != nil {
		return &Resolver{db: reader, entries: []entry{}}
	}

	entries := make([]entry, 0, len(raws))
	for _, raw := range raws {
		prefix, err := netip.ParsePrefix(strings.TrimSpace(raw.CIDR))
		if err != nil {
			continue
		}
		entries = append(entries, entry{
			prefix:  prefix,
			country: strings.TrimSpace(raw.Country),
			region:  strings.TrimSpace(raw.Region),
			city:    strings.TrimSpace(raw.City),
			lat:     raw.Lat,
			lng:     raw.Lng,
		})
	}
	return &Resolver{db: reader, entries: entries}
}

func (r *Resolver) Lookup(ip string) *GeoInfo {
	rawIP := strings.TrimSpace(ip)
	addr, err := netip.ParseAddr(rawIP)
	if err != nil {
		return nil
	}

	if r.db != nil {
		var record struct {
			Country struct {
				Names map[string]string `maxminddb:"names"`
			} `maxminddb:"country"`
			Subdivisions []struct {
				Names map[string]string `maxminddb:"names"`
			} `maxminddb:"subdivisions"`
			City struct {
				Names map[string]string `maxminddb:"names"`
			} `maxminddb:"city"`
			Location struct {
				Latitude  float64 `maxminddb:"latitude"`
				Longitude float64 `maxminddb:"longitude"`
			} `maxminddb:"location"`
		}

		parsedIP := net.ParseIP(rawIP)
		if parsedIP != nil {
			if err := r.db.Lookup(parsedIP, &record); err == nil {
				country := chooseLocalizedName(record.Country.Names)
				region := ""
				if len(record.Subdivisions) > 0 {
					region = chooseLocalizedName(record.Subdivisions[0].Names)
				}
				city := chooseLocalizedName(record.City.Names)
				if country != "" || region != "" || city != "" {
					return &GeoInfo{
						Country: country,
						Region:  region,
						City:    city,
						Lat:     record.Location.Latitude,
						Lng:     record.Location.Longitude,
					}
				}
			}
		}
	}

	for _, item := range r.entries {
		if item.prefix.Contains(addr) {
			return &GeoInfo{
				Country: item.country,
				Region:  item.region,
				City:    item.city,
				Lat:     item.lat,
				Lng:     item.lng,
			}
		}
	}
	return nil
}

func chooseLocalizedName(names map[string]string) string {
	if names == nil {
		return ""
	}
	if v := strings.TrimSpace(names["zh-CN"]); v != "" {
		return v
	}
	if v := strings.TrimSpace(names["en"]); v != "" {
		return v
	}
	for _, v := range names {
		if strings.TrimSpace(v) != "" {
			return strings.TrimSpace(v)
		}
	}
	return ""
}

func openMMDBAt(path string) *maxminddb.Reader {
	if path == "" {
		return nil
	}
	if _, err := os.Stat(path); err != nil {
		return nil
	}
	db, err := maxminddb.Open(path)
	if err != nil {
		return nil
	}
	return db
}

func openMMDB() *maxminddb.Reader {
	candidates := []string{
		"internal/geo/data/GeoLite2-City.mmdb",
		"server/internal/geo/data/GeoLite2-City.mmdb",
		"data/GeoLite2-City.mmdb",
	}

	for _, p := range candidates {
		abs := p
		if !filepath.IsAbs(abs) {
			wd, err := os.Getwd()
			if err == nil {
				abs = filepath.Join(wd, p)
			}
		}
		if db := openMMDBAt(abs); db != nil {
			return db
		}
	}
	return nil
}
