# K12TechPro Reach Map

Interactive state-by-state school outreach map for K12TechPro.

The site reads directly from the published Google Sheet CSV, so normal spreadsheet changes such as changing a school's Status are reflected on the map without manually updating website files.

## Data source

Published Google Sheet CSV:

https://docs.google.com/spreadsheets/d/e/2PACX-1vRRDjkaoyGRAQWhN8ZxFCXj1c0TdBvoEIQ_0JaBi6PX7Ym3ezvdk7b1ME9Q6ISveDuAHjTBp5gPFAA8/pub?gid=1624321924&single=true&output=csv

## Map statuses

- Member — blue
- Contacted — orange
- Not on Pro — red

## Coordinates

Markers require Latitude and Longitude values in the Google Sheet. The separate Apps Script geocoding process fills those columns in batches. Once a school has coordinates, ordinary status/data edits do not need to be geocoded again.

## Hosting

This repository is a static site and can be deployed on GitHub Pages, Cloudflare Pages, Netlify, or another static host that allows embedding.
