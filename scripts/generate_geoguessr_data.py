import urllib.request
import urllib.parse
import json
import time
import re
import os

ENDPOINT_URL = 'https://query.wikidata.org/sparql'

def get_wikidata(query):
    print("Fetching data from WikiData...")
    url = ENDPOINT_URL + '?' + urllib.parse.urlencode({'query': query})
    req = urllib.request.Request(url, headers={
        'User-Agent': 'CovoApp/1.0 (https://covo.app; contact@example.com) python-urllib/3',
        'Accept': 'application/sparql-results+json'
    })
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode('utf-8'))
    except Exception as e:
        raise Exception(f"Query failed: {e}")

def process_results(results):
    locations = []
    for result in results['results']['bindings']:
        label = result.get('itemLabel', {}).get('value', 'Unknown')
        pic = result.get('pic', {}).get('value', '')
        coords_str = result.get('coords', {}).get('value', '')
        
        # coords_str looks like: Point(139.691666666 35.689444444)
        match = re.search(r'Point\(([^ ]+)\s+([^ ]+)\)', coords_str)
        if not match:
            continue
        lng = float(match.group(1))
        lat = float(match.group(2))
        
        # Convert full image URL to thumbnail URL
        img_url = pic.replace('http://', 'https://')
        if "Special:FilePath" in pic:
            if pic.lower().endswith(('.jpg', '.jpeg', '.png', '.webp')):
               img_url = img_url + "?width=1000"

        # Q-ID label might be an entity ID if no label exists. skip those.
        if label.startswith('http://www.wikidata.org/entity/'):
             continue
        
        # Filter out obviously bad strings and images (maps, flags, globes, collages)
        pic_lower = urllib.parse.unquote(pic.lower())
        bad_keywords = ['flag', 'coat_of_arms', 'coat of arms', 'map', 'logo', 'locator', 'earth', 'globe', 'emblem', 'seal', 'symbol', 'icon', 'montage', 'collage', 'location', 'chart', 'graph']
        if any(keyword in pic_lower for keyword in bad_keywords):
            continue
        
        locations.append({
            'name': label,
            'lat': lat,
            'lng': lng,
            'q': label,
            'imgUrl': img_url
        })
        
    # Remove duplicates by name
    seen = set()
    unique_locations = []
    for loc in locations:
        if loc['name'] not in seen:
            seen.add(loc['name'])
            unique_locations.append(loc)
    return unique_locations

# EASY: Cities with population > 500,000 + famous tourist attractions
EASY_QUERY = """
SELECT ?item ?itemLabel ?pic ?coords
WHERE {
  {
    ?item wdt:P31 wd:Q515 .
    ?item wdt:P1082 ?population .
    FILTER(?population > 100000)
  } UNION {
    ?item wdt:P31 wd:Q570116 .
  }
  ?item wdt:P18 ?pic .
  ?item wdt:P625 ?coords .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "ja,en". }
}
LIMIT 2000
"""

# NORMAL: Towns, smaller cities, and regular landmarks
NORMAL_QUERY = """
SELECT ?item ?itemLabel ?pic ?coords
WHERE {
  {
    ?item wdt:P31 wd:Q3957 .
  } UNION {
     ?item wdt:P31 wd:Q41176 .
  }
  ?item wdt:P18 ?pic .
  ?item wdt:P625 ?coords .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "ja,en". }
}
LIMIT 2000
"""

# HARD: Villages, hamlets, very small remote places
HARD_QUERY = """
SELECT ?item ?itemLabel ?pic ?coords
WHERE {
  ?item wdt:P31 wd:Q532 .
  ?item wdt:P18 ?pic .
  ?item wdt:P625 ?coords .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "ja,en,fr,es". }
}
LIMIT 2000
"""

def main():
    print("Fetching EASY locations...")
    easy_data = get_wikidata(EASY_QUERY)
    easy_locations = process_results(easy_data)
    print(f"EASY locations fetched: {len(easy_locations)}")
    time.sleep(2) # rate limit prevention

    print("Fetching NORMAL locations...")
    normal_data = get_wikidata(NORMAL_QUERY)
    normal_locations = process_results(normal_data)
    print(f"NORMAL locations fetched: {len(normal_locations)}")
    time.sleep(2)

    print("Fetching HARD locations...")
    hard_data = get_wikidata(HARD_QUERY)
    hard_locations = process_results(hard_data)
    print(f"HARD locations fetched: {len(hard_locations)}")
    
    js_content = f"// Auto-generated from WikiData. Over 3000 high-quality locations.\n\n"
    js_content += f"const EASY_LOCATIONS = {json.dumps(easy_locations, ensure_ascii=False, indent=2)};\n\n"
    js_content += f"const NORMAL_LOCATIONS = {json.dumps(normal_locations, ensure_ascii=False, indent=2)};\n\n"
    js_content += f"const HARD_LOCATIONS = {json.dumps(hard_locations, ensure_ascii=False, indent=2)};\n\n"
    js_content += f"window.EASY_LOCATIONS = EASY_LOCATIONS;\n"
    js_content += f"window.NORMAL_LOCATIONS = NORMAL_LOCATIONS;\n"
    js_content += f"window.HARD_LOCATIONS = HARD_LOCATIONS;\n"

    output_path = os.path.join(os.path.dirname(__file__), '..', 'public', 'js', 'geoguessr_locations.js')
    output_path = os.path.abspath(output_path)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(js_content)
        
    print(f"Successfully generated {output_path}")
    print(f"Total: {len(easy_locations)} EASY, {len(normal_locations)} NORMAL, {len(hard_locations)} HARD")

if __name__ == '__main__':
    main()
