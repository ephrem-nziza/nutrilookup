# NutriLookup

A small web app where you search for a food and see how many calories and how much protein it has. You can filter by food type, sort the results, and click a food to see its full list of nutrients. All values are per 100g.

I made it because it's annoying to compare foods when you're trying to eat better. This puts the numbers side by side.

## Links

- Live site (through the load balancer): https://www.ephremnziza.tech
- Web-01 directly: http://35.177.53.215
- Web-02 directly: http://13.40.95.4
- Repo: https://github.com/ephrem-nziza/nutrilookup
- Demo video (2 min max): add the link here after uploading

No login is needed to use the app.

## Features

- Search any food by name
- Filter by data type (Foundation, SR Legacy, Survey (FNDDS), Branded)
- Sort by name, calories (high to low or low to high), or protein
- Click a food to see every nutrient in a popup
- Loading message, empty results message, and error messages (timeout, bad response, no connection)

## API used

[USDA FoodData Central](https://fdc.nal.usda.gov/) API. Docs: https://fdc.nal.usda.gov/api-guide.html

Thanks to the USDA for making this data free to use. You need a free key to use it: https://fdc.nal.usda.gov/api-key-signup

Endpoint I use: `/fdc/v1/foods/search`

## Running it locally

1. Clone the repo
   ```
   git clone https://github.com/ephrem-nziza/nutrilookup.git
   cd nutrilookup
   ```
2. Make your own config file from the example
   ```
   cp config.example.js config.js
   ```
3. Open `config.js` and put your USDA key in place of `YOUR_USDA_KEY_HERE`. This file is in `.gitignore`, so it never gets pushed.
4. Start a local server in the folder
   ```
   python3 -m http.server 8000
   ```
5. Open http://localhost:8000 in your browser

Locally the browser talks to USDA directly using the key from `config.js`.

## How the API key is kept secret

If I put the key in `config.js` on the live site, anyone could read it in the browser. So on the servers it works differently:

- The `config.js` on the servers has no key. It only says `base: '/api'`, so the app calls `/api/...` on my own server.
- nginx forwards `/api/` to USDA and adds the key itself. The key sits in `/etc/nginx/snippets/usda-key.conf` on each server, readable only by root.
- The key is never in the repo, never sent to the browser, and never in the page's URLs.

## Deployment (web-01 and web-02)

I did the same steps on both servers. Both are Ubuntu 20.04 with nginx already installed.

1. Connect over SSH
   ```
   ssh -i ~/.ssh/id_rsa ubuntu@<server-ip>
   ```
2. Get the code
   ```
   sudo mkdir -p /var/www/nutrilookup
   sudo chown ubuntu:ubuntu /var/www/nutrilookup
   git clone https://github.com/ephrem-nziza/nutrilookup.git /var/www/nutrilookup
   ```
3. Create the server's own `config.js` (no key in it)
   ```
   cd /var/www/nutrilookup
   cat > config.js << 'EOF'
   const config = {
     base: '/api'
   };
   EOF
   ```
4. Put the USDA key in an nginx snippet file, owned by root and locked down
   ```
   sudo nano /etc/nginx/snippets/usda-key.conf
   sudo chown root:root /etc/nginx/snippets/usda-key.conf
   sudo chmod 640 /etc/nginx/snippets/usda-key.conf
   ```
   The file has one line: `proxy_set_header X-Api-Key "<my key>";`
5. Edit `/etc/nginx/sites-enabled/default`. I changed the `root` line to `root /var/www/nutrilookup;` and added these two blocks inside the `server { }`:
   ```
   location /api/ {
           proxy_pass https://api.nal.usda.gov/fdc/v1/;
           proxy_ssl_server_name on;
           include snippets/usda-key.conf;
   }

   location = /404.html {
           root /var/www/html;
           internal;
   }
   ```
   The second block keeps my custom 404 page from an earlier project working. The server also adds an `X-Served-By` header with its hostname, which I use to see which server answered.
6. Test the config and reload
   ```
   sudo nginx -t
   sudo nginx -s reload
   ```
7. Check it works
   ```
   curl -I localhost
   curl -s "localhost/api/foods/search?query=banana&pageSize=1" | head -c 200
   ```
   The first shows my app's `index.html` and the `X-Served-By` header. The second returns JSON from USDA, which means nginx forwarded the request and added the key.

To update the app later, I run `git pull origin main` inside `/var/www/nutrilookup` on both servers.

## Load balancer (lb-01)

lb-01 runs HAProxy. Traffic to the load balancer goes to web-01 and web-02 in turn (round robin). This is the part of `/etc/haproxy/haproxy.cfg` that does it:

```
backend web_servers
balance roundrobin
server 7380-web-01 35.177.53.215:80 check
server 7380-web-02 13.40.95.4:80 check

frontend http_front
    bind *:80
    bind *:443 ssl crt /etc/haproxy/certs/www.ephremnziza.tech.pem
    mode http
    http-request redirect scheme https code 301 unless { ssl_fc }
    http-request set-header X-Forwarded-Proto https if { ssl_fc }
    default_backend web_servers
```

- `balance roundrobin` sends each new request to the next server in the list.
- `check` makes HAProxy test each server, and it stops sending traffic to one that is down.
- Port 80 redirects to HTTPS, and port 443 uses my certificate for www.ephremnziza.tech, which points to lb-01's IP (18.175.244.5).

I checked the config with `sudo haproxy -c -f /etc/haproxy/haproxy.cfg` (it said the configuration is valid) and the service was running.

## Testing the load balancer

I sent 6 requests to the load balancer from lb-01 and printed which server answered each one:

```
for i in 1 2 3 4 5 6; do curl -skI https://localhost | grep -i x-served-by; done
```

Result:

```
x-served-by: 7380-web-01
x-served-by: 7380-web-02
x-served-by: 7380-web-01
x-served-by: 7380-web-02
x-served-by: 7380-web-01
x-served-by: 7380-web-02
```

The servers alternate, so traffic is shared between them. I also opened https://www.ephremnziza.tech in the browser, searched for foods, and used the filter, sort and detail popup. The `X-Served-By` response header in the Network tab changes between web-01 and web-02 when I reload.

## Challenges

- `config.js` gave a 404 and then "config is not defined". The file wasn't in the folder the server was running from.
- I got a 403 from the API. Two small typos caused it: `config.apikey` vs `config.apiKey` (JavaScript cares about capital letters), and a `%` typed instead of `&` in the URL.
- The detail popup crashed because the id in the HTML was `--detail` instead of `detail`, so `getElementById` returned null.
- GitHub rejected my password when pushing. I had to make a personal access token and use that.
- I wanted to keep the API key out of the browser. The fix was to let nginx add the key on the server and make the app call `/api/` on its own server.
- I ran some server commands on my own computer by mistake because I didn't check the prompt. Now I check that it says `ubuntu@7380-web-01` or `web-02` first.
- My SSH keys were in one Ubuntu install and the VS Code terminal was a different one with no keys. I had to use the right terminal.
- After I changed nginx's `root`, web-02 still showed the old page until I reloaded nginx.
- Some foods have no calories or protein in the API, so those cards show "n/a" and the sort puts them last.

## Credits

- USDA FoodData Central API
- HAProxy and nginx
- No frameworks or libraries, just plain HTML, CSS and JavaScript