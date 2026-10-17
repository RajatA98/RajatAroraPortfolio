import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import type { AstroComponentFactory } from 'astro/runtime/server/index.js';
import { loadRenderers } from 'astro:container';
import { getContainerRenderer as reactContainerRenderer } from '@astrojs/react/container-renderer';

type RenderOptions = Parameters<AstroContainer['renderToString']>[1];

let containerPromise: Promise<AstroContainer> | undefined;

/**
 * One shared Astro container per test file; creating it is the slow part.
 * The React renderer is loaded so pages and components that carry the Voyage
 * island (Build-Phase 5) render their server HTML, astro-island wrapper included.
 */
function getContainer(): Promise<AstroContainer> {
  containerPromise ??= loadRenderers([reactContainerRenderer()]).then((renderers) =>
    AstroContainer.create({ renderers }),
  );
  return containerPromise;
}

/**
 * Render an Astro component (a page, layout or component) to an HTML string.
 * Pass `request` with a full URL when the component reads Astro.url.
 */
export async function renderAstro(
  component: AstroComponentFactory,
  options: RenderOptions = {},
): Promise<string> {
  const container = await getContainer();
  return container.renderToString(component, {
    request: new Request('https://rajatarora.com/'),
    ...options,
  });
}
