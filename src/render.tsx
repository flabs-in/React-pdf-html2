import React, { ReactElement } from 'react';
import renderers, { renderBlock, renderInline, renderNoop } from './renderers';
import { Text, View } from '@react-pdf/renderer';
import parseHtml, { HtmlContent, HtmlElement } from './parse';
import { createHtmlStylesheet, HtmlStyle, HtmlStyles } from './styles';
import { Style } from '@react-pdf/types';
import { isText, Tag } from './tags';

export type HtmlRenderer = React.FC<
  React.PropsWithChildren<{
    element: HtmlElement;
    style: Style[];
    stylesheets: HtmlStyles[];
  }>
>;

export type HtmlRenderers = Record<Tag | string, HtmlRenderer>;

export type HtmlRenderOptions = {
  collapse: boolean;
  renderers: HtmlRenderers;
  stylesheets: HtmlStyles[];
  resetStyles: boolean;
};

type ContentBucket = {
  hasBlock: boolean;
  content: HtmlContent;
};

const convertEntities = (input: string) => {
  const entities = [
    ['amp', '&'],
    ['apos', "'"],
    ['#x27', "'"],
    ['#x2F', '/'],
    ['#39', "'"],
    ['#47', '/'],
    ['lt', '<'],
    ['gt', '>'],
    ['nbsp', ' '],
    ['quot', '"'],
  ];

  let text = input;
  for (let entity of entities) {
    text = text.replace(new RegExp('&' + entity[0] + ';', 'g'), entity[1]);
  }
  return text;
};

export const isBlockStyle = (style: HtmlStyle) =>
  ['block', 'flex'].includes(style.display);

export const hasBlockContent = (element: HtmlElement | string): boolean => {
  if (typeof element === 'string') {
    return false;
  }

  if (element.tag === 'a' || isText[element.tag]) {
    if (element.style?.some(isBlockStyle)) {
      return true;
    }

    // anchor tags match their content
    if (element.content) {
      return element.content.some(hasBlockContent);
    }
    return false;
  }

  return true;
};

const ltrim = (text: string): string => text.replace(/^\s+/, '');
const rtrim = (text: string): string => text.replace(/\s+$/, '');

/**
 * Groups all block and non-block elements into buckets so that all non-block elements can be rendered in a parent Text element
 * @param elements Elements to place in buckets of block and non-block content
 * @param collapse
 * @param parentTag
 */
export const bucketElements = (
  elements: HtmlContent,
  collapse: boolean,
  parentTag?: Tag | string
): ContentBucket[] => {
  let bucket: ContentBucket;
  let hasBlock: boolean;
  const buckets: ContentBucket[] = [];
  elements.forEach((element, index) => {
    // clear empty strings between block elements
    if (typeof element === 'string') {
      if (collapse) {
        if (parentTag === 'pre') {
          if (element[0] === '\n') {
            element = element.substr(1);
          }
          if (element[element.length - 1] === '\n') {
            element = element.substr(0, element.length - 1);
          }
        } else {
          if (hasBlock || hasBlock === undefined) {
            element = ltrim(element);
          }
          const next = elements[index + 1];
          if (next && hasBlockContent(next)) {
            element = rtrim(element);
          }
        }
      }
      if (element === '') {
        return;
      }
    }
    const block = hasBlockContent(element);
    if (block !== hasBlock) {
      hasBlock = block;
      bucket = {
        hasBlock,
        content: [],
      };
      buckets.push(bucket);
    }
    bucket.content.push(element);
  });

  return buckets;
};

type RenderedContent = ReactElement | ReactElement[] | string | string[];

export const renderElement = (
  element: HtmlElement | string,
  stylesheets: HtmlStyles[],
  renderers: HtmlRenderers,
  children?: any,
  index?: number
): RenderedContent => {
  if (typeof element === 'string') {
    element = convertEntities(element);
    if (/(\s )|( \s)/.test(element)) {
      // hack to avoid collapsing sequential spaces
      return element
        .split(/(\s{2,})/g)
        .reduce(
          (strings, string, index) =>
            string === ''
              ? strings
              : strings.concat(index % 2 ? string.split('') : string),
          [] as string[]
        );
    }
    return element;
  }
  let Element: HtmlRenderer | undefined = renderers[element.tag];
  if (!Element) {
    if (!(element.tag in isText)) {
      // Unknown element, do nothing
      console.warn(`Excluding "${element.tag}" because it has no renderer`);
      Element = renderNoop;
    } else {
      Element = hasBlockContent(element) ? renderBlock : renderInline;
    }
  }

  return (
    <Element
      key={index}
      style={element.style}
      children={children}
      element={element}
      stylesheets={stylesheets}
    />
  );
};

export const collapseWhitespace = (string: any): string =>
  string.replace(/(\s+)/g, ' ');

export const renderBucketElement = (
  element: HtmlElement | string,
  options: HtmlRenderOptions,
  index: number
): RenderedContent => {
  if (typeof element === 'string') {
    return renderElement(
      options.collapse ? collapseWhitespace(element) : element,
      options.stylesheets,
      options.renderers,
      undefined,
      index
    );
  }
  return renderElement(
    element,
    options.stylesheets,
    options.renderers,
    renderElements(
      element.content,
      element.tag === 'pre' ? { ...options, collapse: false } : options,
      element
    ),
    index
  );
};

const isAnchor = (content: HtmlContent | HtmlElement): boolean => {
  return Array.isArray(content)
    ? content.length === 1 &&
        typeof content[0] !== 'string' &&
        content[0].tag === 'a'
    : content.tag === 'a';
};

export const renderElements = (
  elements: HtmlContent,
  options: HtmlRenderOptions,
  parent?: HtmlElement
): RenderedContent | RenderedContent[] => {
  const buckets = bucketElements(elements, options.collapse, parent?.tag);
  const parentIsText = parent && !isAnchor(parent) && !hasBlockContent(parent);

  const renderedBuckets: (RenderedContent[] | RenderedContent)[] = buckets.map(
    (bucket, bucketIndex) => {
      const wrapWithText =
        !bucket.hasBlock && !parentIsText && !isAnchor(bucket.content);

      // Avoid extra array
      if (bucket.content.length === 1 && !wrapWithText) {
        return renderBucketElement(bucket.content[0], options, bucketIndex);
      }

      let rendered: RenderedContent | RenderedContent[] = bucket.content.map(
        (element, index) => {
          return renderBucketElement(element, options, index);
        }
      );

      // unwrap extra array
      if (rendered.length === 1) {
        rendered = rendered[0];
      }

      if (wrapWithText) {
        return <Text key={bucketIndex}>{rendered}</Text>;
      } else {
        return buckets.length === 1 ? (
          rendered
        ) : (
          <React.Fragment key={bucketIndex}>{rendered}</React.Fragment>
        );
      }
    }
  );

  // unwrap extra array
  return buckets.length === 1
    ? (renderedBuckets[0] as RenderedContent)
    : (renderedBuckets as RenderedContent[]);
};

export const applyStylesheets = (
  stylesheets: HtmlStyles[],
  rootElement: HtmlElement
) => {
  stylesheets.forEach((stylesheet) => {
    for (const selector of Object.keys(stylesheet)) {
      const elements = rootElement.querySelectorAll(selector) as HtmlElement[];
      elements.forEach((element) => {
        element.style.push(stylesheet[selector]);
      });
    }
  });
};

const renderHtml = (
  text: string,
  options: {
    collapse?: boolean;
    renderers?: HtmlRenderers;
    style?: Style | (Style | undefined)[];
    stylesheet?: HtmlStyles | HtmlStyles[];
    resetStyles?: boolean;
  } = {}
): ReactElement => {
  const defaultFontSize = 10;
  const fontSizeStyle: any = { fontSize: defaultFontSize };
  const styles = options.style
    ? Array.isArray(options.style)
      ? options.style
      : [options.style]
    : [];

  styles.forEach((style) => {
    if (!style) {
      return;
    }
    if (typeof style.fontSize === 'number') {
      fontSizeStyle.fontSize = style.fontSize as unknown as number;
    }
    if (typeof style.fontSize === 'string' && style.fontSize.endsWith('px')) {
      fontSizeStyle.fontSize = parseInt(style.fontSize, 10);
    }
  });
  const baseStyles = createHtmlStylesheet(
    fontSizeStyle.fontSize,
    options.resetStyles
  );
  const parsed = parseHtml(text);

  const stylesheets = options.stylesheet
    ? Array.isArray(options.stylesheet)
      ? options.stylesheet
      : [options.stylesheet]
    : [];

  const opts: HtmlRenderOptions = {
    collapse: true,
    resetStyles: false,
    ...options,
    renderers: { ...renderers, ...options.renderers },
    stylesheets: [baseStyles, ...stylesheets, ...parsed.stylesheets],
  };

  applyStylesheets(opts.stylesheets, parsed.rootElement);

  return (
    <View style={{ ...styles, ...fontSizeStyle }}>
      {renderElements(parsed.rootElement.content, opts)}
    </View>
  );
};

export default renderHtml;
