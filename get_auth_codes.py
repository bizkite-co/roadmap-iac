import os
import requests

API_KEY = os.environ.get('GODADDY_API_KEY')
API_SECRET = os.environ.get('GODADDY_API_SECRET')
DELEGATE = os.environ.get('GODADDY_DELEGATE')

if not API_KEY or not API_SECRET:
    print('Error: API_KEY and API_SECRET environment variables must be set.')
    exit(1)

def get_auth_code(domain):
    url = f'https://api.godaddy.com/v1/domains/{domain}/authCode'
    headers = {
        'Authorization': f'sso-key {API_KEY}:{API_SECRET}',
        'Accept': 'application/json'
    }
    if DELEGATE:
        headers['X-Shopper-Id'] = DELEGATE
    try:
        response = requests.post(url, headers=headers)
        response.raise_for_status()  # Raise HTTPError for bad responses (4xx or 5xx)
        auth_code = response.text.strip()
        return auth_code
    except requests.exceptions.RequestException as e:
        print(f'Error retrieving auth code for {domain}: {e}')
        return None

if __name__ == '__main__':
    domains = ['retirementtaxanalyzer.com', 'roadmappartners.net']
    for domain in domains:
        auth_code = get_auth_code(domain)
        if auth_code:
            print(f'Auth code for {domain}: {auth_code}')
        else:
            print(f'Failed to retrieve auth code for {domain}')


            https://us05web.zoom.us/j/84053803208?pwd=pMTQeJH2qViTruJDNSZ2GKrbzUXUra.1