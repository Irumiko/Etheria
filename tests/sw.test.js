// Import the necessary libraries
import { describe, it, expect } from 'jest';
import { cachingStrategy, eventHandlers } from '../src/service-worker';

describe('Service Worker Caching Strategies', () => {
  it('should cache the static assets', () => {
    // Simulate fetch event
    const request = new Request('/index.html');
    const response = cachingStrategy(request);

    expect(response).toBeDefined();
    expect(response.status).toEqual(200);
  });

  it('should return cached response', async () => {
    const request = new Request('/about.html');
    const cachedResponse = await caches.open('my-cache').then(cache => cache.match(request));

    expect(cachedResponse).toBeDefined();
  });
});

describe('Service Worker Event Handlers', () => {
  it('should handle install event', () => {
    const event = { waitUntil: jest.fn() };
    eventHandlers.install(event);

    expect(event.waitUntil).toHaveBeenCalled();
  });

  it('should handle fetch event', () => {
    const event = { request: new Request('/index.html'), respondWith: jest.fn() };
    eventHandlers.fetch(event);

    expect(event.respondWith).toHaveBeenCalled();
  });
});