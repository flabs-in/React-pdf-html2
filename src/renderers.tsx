import React from 'react';
import { Link, Text, View, Image } from '@react-pdf/renderer';
import { HtmlRenderer, HtmlRenderers } from './render';
import { HtmlElement } from './parse';
import { HtmlStyle } from './styles';
import { lowerAlpha, orderedAlpha, upperAlpha } from './ordered.type';

export const renderNoop: HtmlRenderer = ({ children }) => <></>;

export const renderPassThrough: React.FC<React.PropsWithChildren<any>> = ({
  children,
}) => children;

export const renderBlock: HtmlRenderer = ({ style, children }) => {
  if (style?.find((e) => e.textAlign == 'center')) {
    style?.push({
      display: 'flex',
      flexDirection: 'row',
      justifyContent: 'center',
    });
  }
  return <View style={style}>{children}</View>;
};

export const renderInline: HtmlRenderer = ({ style, children }) => {
  if (style?.find((e) => e.textAlign == 'center')) {
    style?.push({
      display: 'flex',
      flexDirection: 'row',
      justifyContent: 'center',
    });
  }
  return <Text style={style}>{children}</Text>;
};

let spanIndex = 0;

const rowSpanMap: Map<string, { remaining: number; colIndex: number }[]> =
  new Map();

const getTableId = (table: HtmlElement): string => {
  return table.attributes.id || `table-${table.indexOfType}`;
};

export const renderCell: HtmlRenderer = ({ style, element, children }) => {
  const table = element.closest('table') as HtmlElement | undefined;
  const colSpan = parseInt(element.attributes.colspan) || 1;
  const rowSpan = parseInt(element.attributes.rowspan) || 1;
  const tableAttributes = table?.attributes as any;
  if (!table) {
    throw new Error('td element rendered outside of a table');
  }

  const tableId = getTableId(table);
  const row = element.parentNode as HtmlElement;
  const rowIndex = row?.indexOfType || 0;

  if (!rowSpanMap.has(tableId)) {
    rowSpanMap.set(tableId, []);
  }
  const spanningCells = rowSpanMap.get(tableId)!;

  spanningCells.forEach((cell) => {
    if (cell.remaining > 0) {
      cell.remaining--;
    }
  });
  rowSpanMap.set(
    tableId,
    spanningCells.filter((cell) => cell.remaining > 0)
  );

  if (rowSpan > 1) {
    spanningCells.push({
      remaining: rowSpan - 1,
      colIndex: element.indexOfType,
    });
  }

  const combinedStyle = style.reduce(
    (acc, current) => Object.assign(acc, current),
    {} as HtmlStyle
  );

  const tableStyles = table.style.reduce(
    (combined, tableStyle) => Object.assign(combined, tableStyle),
    {} as HtmlStyle
  );

  const colWidths = tableStyles.colWidths || [];
  let columnWidth = 0;
  if (colWidths?.length > 0) {
    for (let i = 0; i < colSpan; i++) {
      columnWidth += parseInt(colWidths[spanIndex + i]) || 0;
    }
    spanIndex += colSpan;
    if (spanIndex == colWidths?.length) {
      spanIndex = 0;
    }
  }

  const baseStyles: HtmlStyle = {
    border: tableStyles.border,
    borderColor: tableStyles.borderColor,
    borderWidth: tableStyles.borderWidth,
    borderStyle: tableStyles.borderStyle,
  };

  if (
    (tableStyles as any).borderSpacing &&
    (tableStyles as any).borderCollapse !== 'collapse'
  ) {
    baseStyles.borderWidth = tableStyles.borderWidth;
    baseStyles.margin = (tableStyles as any).borderSpacing;
  } else {
    baseStyles.borderRightWidth = 0;
    baseStyles.borderBottomWidth = 0;
    if (element.indexOfType !== 0) {
      baseStyles.borderLeftWidth = tableStyles.borderWidth;
      baseStyles.borderTopWidth = tableStyles.borderWidth;
    }
  }

  if (tableAttributes?.border == 0) {
    baseStyles.borderRightWidth = '0px';
    baseStyles.borderBottomWidth = '0px';
    baseStyles.borderTopWidth = '0px';
    baseStyles.borderLeftWidth = '0px';
  }

  const overrides: HtmlStyle = {};
  if (combinedStyle.textAlign == 'center') {
    overrides.alignItems = 'center';
  }

  if (combinedStyle.verticalAlign == 'center') {
    overrides.justifyContent = 'center';
  }

  if (columnWidth) {
    overrides.width = `${columnWidth}%`;
  }

  if (rowSpan > 1) {
    const rowHeight = tableStyles.rowHeight || 20;
    const calculatedHeight =
      typeof rowHeight === 'number'
        ? rowHeight * rowSpan
        : parseFloat(rowHeight) * rowSpan;
    overrides.minHeight = calculatedHeight;
    overrides.position = 'relative';
  }

  const finalStyles = Object.assign({}, baseStyles, combinedStyle, overrides);
  if (!finalStyles.width) finalStyles.flex = 1;
  if (rowSpan <= 1) {
    delete finalStyles.height;
  }

  return <View style={finalStyles}>{children}</View>;
};

const renderers: HtmlRenderers = {
  style: renderNoop,
  script: renderNoop,
  html: renderPassThrough,
  li: ({ element, stylesheets, style, children }) => {
    const bulletStyles = stylesheets.map((stylesheet) => stylesheet.li_bullet);
    const contentStyles = stylesheets.map(
      (stylesheet) => stylesheet.li_content
    );
    const list: HtmlElement = element.closest('ol, ul') as HtmlElement;
    const ordered = list?.tag === 'ol' || element.parentNode.tag === 'ol';
    const listStyle =
      list?.style?.reduce(
        (combined, listStyle) => Object.assign(combined, listStyle),
        {} as HtmlStyle
      ) || {};
    const itemStyle = element.style.reduce(
      (combined, itemStyle) => Object.assign(combined, itemStyle),
      {} as HtmlStyle
    );
    const listStyleType =
      itemStyle.listStyleType ||
      itemStyle.listStyle ||
      listStyle.listStyleType ||
      listStyle.listStyle ||
      '';

    let bullet;
    if (listStyleType.includes('none')) {
      bullet = false;
    } else if (listStyleType.includes('url(')) {
      bullet = (
        <Image
          src={listStyleType.match(/\((.*?)\)/)[1].replace(/(['"])/g, '')}
        />
      );
    } else if (ordered) {
      if (lowerAlpha.includes(listStyleType)) {
        bullet = (
          <Text>{orderedAlpha[element.indexOfType].toLowerCase()}.</Text>
        );
      } else if (upperAlpha.includes(listStyleType)) {
        bullet = (
          <Text>{orderedAlpha[element.indexOfType].toUpperCase()}.</Text>
        );
      } else {
        bullet = <Text>{element.indexOfType + 1}.</Text>;
      }
    } else {
      // if (listStyleType.includes('square')) {
      //   bullet = <Text>■</Text>;
      // } else {
      bullet = <Text>•</Text>;
      // }
    }
    return (
      <View style={style}>
        {bullet && <View style={bulletStyles}>{bullet}</View>}
        <View style={contentStyles}>{children}</View>
      </View>
    );
  },
  a: ({ style, element, children }) => (
    <Link style={style} src={element.attributes.href}>
      {children}
    </Link>
  ),
  img: ({ style, element }) => {
    const { width, height } = element.attributes;
    const dimensions: any = {};
    if (width) {
      dimensions.width = width;
    }
    if (height) {
      dimensions.height = height;
    }
    const finalStyles = Object.assign({}, ...style, dimensions);
    return (
      <View wrap={true}>
        <Image
          style={finalStyles}
          source={{
            uri: element.attributes.src,
            body: null,
            method: 'GET',
            headers: {
              'Cache-Control': 'no-cache',
              'Access-Control-Allow-Origin': '*',
            },
          }}
        />
      </View>
    );
  },
  table: ({ element, style, children }) => {
    const tableId = getTableId(element);
    rowSpanMap.delete(tableId);

    const tableStyles = element.style.reduce(
      (combined, tableStyle) => Object.assign(combined, tableStyle),
      {} as HtmlStyle
    );
    const { border } = element.attributes as any;
    const overrides: HtmlStyle = {};
    if (
      !(tableStyles as any).borderSpacing ||
      (tableStyles as any).borderCollapse === 'collapse'
    ) {
      overrides.borderLeftWidth = 0;
      overrides.borderTopWidth = 0;
    }

    if (border == 0) {
      overrides.borderWidth = '0px';
      overrides.borderStyle = 'none';
    }
    const borderColor = style.find(
      (s) => s.borderColor && s.borderColor !== 'gray'
    )?.borderColor;
    if (borderColor) {
      overrides.borderColor = borderColor;
    }
    const finalStyles = Object.assign({}, ...style, overrides);
    if (!finalStyles.width || parseFloat(finalStyles.width) > 100) {
      finalStyles.width = '100%';
    }
    delete finalStyles.height;
    return <View style={finalStyles}>{children}</View>;
  },
  colgroup: ({ element, children }) => {
    let cols = children as any;
    cols = Array.isArray(cols) ? cols : [cols];
    const colWidths = cols
      .map((col: any) => {
        const style = col?.props?.style || '';
        const widthStyle = style.find((s: any) => s.hasOwnProperty('width'));
        if (widthStyle) {
          return parseInt(widthStyle.width);
        }
        return undefined;
      })
      .filter((width: any) => width !== undefined);
    const table = element.closest('table') as HtmlElement | undefined;
    if (table && colWidths?.length > 0) {
      const totalWidth = colWidths.reduce(
        (acc: any, curr: any) => acc + curr,
        0
      );
      if (Array.isArray(table.style)) {
        const diff = 100 - totalWidth;
        let idx = 0;
        while (idx < colWidths.length && colWidths[idx] + diff < 0) {
          idx++;
        }
        if (idx < colWidths.length) {
          colWidths[idx] += diff;
        }
        table.style.push({ colWidths });
      } else {
        const diff = 100 - totalWidth;
        let idx = 0;
        while (idx < colWidths.length && colWidths[idx] + diff < 0) {
          idx++;
        }
        if (idx < colWidths.length) {
          colWidths[idx] += diff;
        }
        table.style = [{ colWidths }];
      }
    }

    return <></>; // don't render anything
  },
  tr: ({ style, element, children }) => {
    const table = element.closest('table') as HtmlElement | undefined;
    const tableId = table ? getTableId(table) : '';
    const spanningCells = rowSpanMap.get(tableId) || [];

    const finalStyles = Object.assign({}, ...style);

    const hasSpanningCells = spanningCells.some((cell) => cell.remaining > 0);
    if (!hasSpanningCells) {
      delete finalStyles.height;
    }

    return (
      <View wrap={false} style={finalStyles}>
        {children}
      </View>
    );
  },
  br: ({ style }) => (
    <Text wrap={true} style={style}>
      {'\n'}
    </Text>
  ),
  td: renderCell,
  th: renderCell,
};

export default renderers;
