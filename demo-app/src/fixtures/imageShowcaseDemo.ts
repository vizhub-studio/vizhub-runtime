import { VizHubRuntimeFixture } from "./types";

export const imageShowcaseDemo: VizHubRuntimeFixture = {
  label: "Image Showcase Demo (v2)",
  status: "working",
  files: {
    "index.html": `<!DOCTYPE html>
<html>
  <head>
    <title>Image Showcase</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <div class="container">
      <h1>Image Support Showcase</h1>
      <p>This demo showcases image support across VizHub Runtime.</p>
      
      <div class="image-grid">
        <div class="image-item">
          <h3>JPEG Image</h3>
          <img src="favicon-tiny.jpg" class="demo-image" alt="Tiny favicon" />
        </div>
        
        <div class="image-item">
          <h3>PNG Image</h3>
          <img src="test-icon.png" class="demo-image" alt="Test icon" />
        </div>
        
        <div class="image-item">
          <h3>SVG Image</h3>
          <img src="icon.svg" class="demo-image" alt="SVG icon" />
        </div>
      </div>
      
      <div class="info-panel">
        <h3>How it works:</h3>
        <ul>
          <li>Images are automatically detected by file extension</li>
          <li>Base64 content is converted to data URLs</li>
          <li>Works across all runtime versions (V1-V4)</li>
          <li>Supports: JPG, PNG, GIF, SVG, WebP, BMP formats</li>
        </ul>
      </div>
    </div>
    <script type="module" src="index.js"></script>
  </body>
</html>`,
    "styles.css": `body,
html {
  height: 100%;
  margin: 0;
  padding: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.container {
  min-height: 100vh;
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  color: white;
}

h1 {
  font-size: 2.5rem;
  margin-bottom: 0.5rem;
  text-align: center;
  text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
}

.container > p {
  font-size: 1.2rem;
  margin-bottom: 2rem;
  text-align: center;
  opacity: 0.9;
}

.image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 2rem;
  max-width: 900px;
  width: 100%;
  margin-bottom: 2rem;
}

.image-item {
  background: rgba(255, 255, 255, 0.1);
  padding: 1.5rem;
  border-radius: 12px;
  text-align: center;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.image-item h3 {
  margin-top: 0;
  margin-bottom: 1rem;
  font-size: 1.3rem;
}

.demo-image {
  max-width: 100%;
  max-height: 120px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.2);
  transition: transform 0.3s ease;
}

.demo-image:hover {
  transform: scale(1.1);
}

.info-panel {
  background: rgba(255, 255, 255, 0.1);
  padding: 1.5rem;
  border-radius: 12px;
  max-width: 600px;
  width: 100%;
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.info-panel h3 {
  margin-top: 0;
  margin-bottom: 1rem;
  font-size: 1.3rem;
}

.info-panel ul {
  margin: 0;
  padding-left: 1.2rem;
}

.info-panel li {
  margin-bottom: 0.5rem;
  line-height: 1.5;
}`,
    "index.js": `console.log("Image showcase demo loaded!");

// Add some interactive behavior
document.addEventListener('DOMContentLoaded', () => {
  const images = document.querySelectorAll('.demo-image');
  
  images.forEach(img => {
    img.addEventListener('click', () => {
      console.log('Clicked image:', img.alt);
      
      // Create a flash effect
      img.style.filter = 'brightness(1.5)';
      setTimeout(() => {
        img.style.filter = 'brightness(1)';
      }, 200);
    });
  });
  
  console.log('Interactive image showcase ready!');
});`,
    "favicon-tiny.jpg":
      "/9j/4AAQSkZJRgABAQEBLAEsAAD/4RqSRXhpZgAASUkqAAgAAAAIAA4BAgASAAAAbgAAABIBAwABAAAAAQAAABoBBQABAAAAgAAAABsBBQABAAAAiAAAACgBAwABAAAAAgAAADEBAgANAAAAkAAAADIBAgAUAAAAngAAAGmHBAABAAAAsgAAAOoAAABDcmVhdGVkIHdpdGggR0lNUAAsAQAAAQAAACwBAAABAAAAR0lNUCAyLjEwLjMwAAA",
    "test-icon.png":
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
    "icon.svg":
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#4285f4"/><circle cx="50" cy="50" r="20" fill="white"/></svg>',
  },
};
