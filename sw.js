const CACHE_NAME = 'organizador-alunos-v1';

// O PWA só precisa de cachear o próprio index.html, 
// pois todo o CSS, JS e Fontes já estão embutidos nele!
const ASSETS = [
    './',
    './index.html',
    './manifest.json'
];

// Instalação: Cacheia os arquivos essenciais
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('[ServiceWorker] Caching offline assets');
            return cache.addAll(ASSETS);
        })
    );
    self.skipWaiting();
});

// Ativação: Limpa caches de versões anteriores
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keyList => {
            return Promise.all(keyList.map(key => {
                if (key !== CACHE_NAME) {
                    console.log('[ServiceWorker] Removing old cache', key);
                    return caches.delete(key);
                }
            }));
        })
    );
    self.clients.claim();
});

// Interceptação: Responde com cache se offline (Stale-while-revalidate para o index.html)
self.addEventListener('fetch', event => {
    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            const fetchPromise = fetch(event.request).then(networkResponse => {
                // Atualiza o cache de forma assíncrona se for uma navegação (index.html)
                if (event.request.mode === 'navigate' || event.request.url.includes('index.html')) {
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, networkResponse.clone());
                    });
                }
                return networkResponse;
            }).catch(() => {
                // Se o fetch falhar e não houver cache, o app ainda funciona
                // por ser single-page se já estiver carregado.
            });

            // Retorna imediatamente o cache (se existir), caso contrário aguarda a rede
            return cachedResponse || fetchPromise;
        })
    );
});
