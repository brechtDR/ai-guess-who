// This file is used to provide typing information to TypeScript
// for assets that are not TypeScript or JavaScript files.

// For CSS Modules:
// This tells TypeScript that any file ending in .module.css
// is a module that exports a dictionary of strings (class names).
declare module "*.module.css" {
    const classes: { readonly [key: string]: string };
    export default classes;
}
