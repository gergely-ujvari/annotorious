goog.provide('annotorious.shape.style');


/**
 * Keys for astyle
 * @enum {string}
 */
annotorious.shape.style.StyleType = {
  OUTLINE: 'outline',
  STROKE: 'stroke',
  FILL: 'fill'
}

/**
 * A style item, a basic descriptor of a style
 * @param {string} color code for the style
 * @param {number} lineWidth for the style
 * @constructor
 */
annotorious.shape.style.StyleItem = function(color, lineWidth) {
    this.color = color;
    this.lineWidth = lineWidth;
}

/**
 * A shape style, initialized by the three style items
 * @param {annotorious.shape.style.StyleItem} style item for outline
 * @param {annotorious.shape.style.StyleItem} style item code for stroke
 * @param {annotorious.shape.style.StyleItem} style item code for fill
 * @constructor
 */
annotorious.shape.style.ShapeStyle = function(outline, stroke, fill) {
   this[annotorious.shape.style.StyleType.OUTLINE]  = outline;
   this[annotorious.shape.style.StyleType.STROKE]  = stroke;
   this[annotorious.shape.style.StyleType.FILL]  = fill;
}

/**
 * A shape style, which is a map of shape styles, with a default one.
 * @param {annotorious.shape.style.ShapeStyle} the default shape style
 * @constructor
 */
annotorious.shape.style.ShapeStyles = function(defaultStyle) {
    this['default'] = defaultStyle ;
}

/**
 * Add (or change) a colorStyle.
 * @param {string} name of the style
 * @param {annotorious.shape.style.ShapeStyle} the color style to use
 */
annotorious.shape.style.ShapeStyles.prototype.addStyle = function(name, style) {
    this[name] = style;
}

{
    var fillstyle = new annotorious.shape.style.StyleItem(null, 1);
    var outlinestyle = new annotorious.shape.style.StyleItem('#000000', 1);
    var strokestyle = new annotorious.shape.style.StyleItem('#ffffff', 1);
    var histrokestyle = new annotorious.shape.style.StyleItem('#fff000', 1.2);
    var hioutlinestyle = new annotorious.shape.style.StyleItem('#000000', 1.2);

    var defaultstyle = new annotorious.shape.style.ShapeStyle(outlinestyle, strokestyle, fillstyle);
    var highlightstyle = new annotorious.shape.style.ShapeStyle(hioutlinestyle, histrokestyle, fillstyle);
    annotorious.shape.style.DefaultShapeStyles = new annotorious.shape.style.ShapeStyles(defaultstyle);
    annotorious.shape.style.DefaultShapeStyles.addStyle('highlight', highlightstyle);
}
