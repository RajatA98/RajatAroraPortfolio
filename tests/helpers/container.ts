import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import type { AstroComponentFactory } from 'astro/runtime/server/index.js';

type RenderOptions = Parameters<AstroContainer['renderToString']>[1];

let containerPromise: Promise<AstroContainer> | undefined;

/** One shared Astro container per test file; creating it is the slow part. */
function getContainer(): Promise<AstroContainer> {
  containerPromise ??= AstroContainer.create();
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
