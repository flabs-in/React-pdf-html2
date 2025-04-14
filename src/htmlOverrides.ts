export function replaceText(input: string): string {
  const replaceProps = [
    {
      _p: '&middot;',
      _v: '<span style="font-weight:600;">.</span>',
    },
  ];
  replaceProps.forEach((prop) => {
    input = input.replace(new RegExp(prop._p, 'g'), prop._v);
  });
  return input;
}
