var humanEvents = annotorious.events.ui.EventType;

goog.provide('annotorious.hypo.ImagePlugin');

goog.require('goog.array');
goog.require('goog.object');
goog.require('goog.soy');
goog.require('goog.dom');
goog.require('goog.dom.classes');
goog.require('goog.dom.query');
goog.require('goog.events');
goog.require('goog.math');
goog.require('goog.style');

/** Sets up the plugin namespace */
if (!window['annotorious'])
  window['annotorious'] = {};

if (!window['annotorious']['plugin'])
  window['annotorious']['plugin'] = {}

/**
 * Implementation of the Yuma image plugin for Hypothes.is.
 * @param {Element} image the image to be annotated
 * @param {Object} Hyptohes.is guest reference to the embedded guest instance
 * @constructor
 */
annotorious.hypo.ImagePlugin = function(image, guest) {
    this._image = image;
    this._eventBroker = new annotorious.events.EventBroker();
    this._guest = guest;

    //Initialize imageAnnotor with our custom Popup
    this._popup = new annotorious.hypo.Popup(image, this._guest, this._eventBroker);
    this._imageAnnotator = new annotorious.mediatypes.image.ImageAnnotator(image, this._popup);
    this._popup.addAnnotator(this._imageAnnotator);

    //Add polygon selector to imageAnnotator
    var poly_selector = new annotorious.plugins.PolygonSelector.Selector();
    poly_selector.init(this._imageAnnotator, this._imageAnnotator._editCanvas);
    this._imageAnnotator._selectors.push(poly_selector);
    this._imageAnnotator._currentSelector = poly_selector;

    var self = this;

    //Remove the default selection handlers
    var selectionHandler = this._imageAnnotator._eventBroker._handlers[annotorious.events.EventType.SELECTION_COMPLETED][0];
    var cancelHandler = this._imageAnnotator._eventBroker._handlers[annotorious.events.EventType.SELECTION_CANCELED][0];
    this._imageAnnotator._eventBroker.removeHandler(annotorious.events.EventType.SELECTION_COMPLETED, selectionHandler);
    this._imageAnnotator._eventBroker.removeHandler(annotorious.events.EventType.SELECTION_CANCELED, cancelHandler);

    //Add selection handlers
    this._imageAnnotator._eventBroker.addHandler(annotorious.events.EventType.SELECTION_COMPLETED, function(event) {
      self._guest.selectedShape = {
        selector: [{
            type: "ShapeSelector",
            shapeType: event.shape.type,
            geometry: event.shape.geometry,
            source: self._imageAnnotator._image.src
        }]
      };

      self._guest.onAdderClick(event);
      var annotation = { src: self._imageAnnotator._image.src, shapes: [event.shape] };
      self._imageAnnotator.addAnnotation(annotation);
      self._imageAnnotator.stopSelection();
    });


    this._imageAnnotator._eventBroker.addHandler(annotorious.events.EventType.SELECTION_CANCELED, function() {
      if (annotorious.events.ui.hasMouse)
        goog.style.showElement(self._imageAnnotator._editCanvas, false);
      self._imageAnnotator._currentSelector.stopSelection();
    });

  /**
   * add an annotation to the ImageAnnotator
   * @param annotation: the annotation to add
   */
  annotorious.hypo.ImagePlugin.prototype.addAnnotation = function(annotation) {
    this._imageAnnotator.addAnnotation(annotation);
  }

  annotorious.hypo.ImagePlugin.prototype.disableSelection = function() {
      this._imageAnnotator._selectionEnabled = false;
      this._imageAnnotator._hint = null;
      //ToDo: remove Click and drag to Annotate label
  }
}

/**
 * HYPO plugin interface.
 */
window['Annotator']['Plugin']['AnnotoriousImagePlugin'] = (function() {
  function AnnotoriousImagePlugin(element, options) {
    this._el = element;
    this.options = options;
    this.handlers = {};
  }

  AnnotoriousImagePlugin.prototype['addAnnotation'] = function(selector, text) {
    var annotation = { text: text};
    annotation.source = selector.source;
    var subshape = null;
    if (selector.shapeType == 'rect') {
      subshape = new annotorious.shape.geom.Rectangle(
          selector.geometry.x, selector.geometry.y,
          selector.geometry.width, selector.geometry.height);
    } else {
        if (selector.shapeType == 'polygon') {
          subshape = new annotorious.shape.geom.Polygon(selector.geometry.points);
        }
    }
    var shape = new annotorious.shape.Shape(selector.shapeType, subshape, annotorious.shape.Units.FRACTION);

    annotation.shapes = [shape];

    var handler = this.handlers[annotation.source];
    handler.addAnnotation(annotation);
  }

  AnnotoriousImagePlugin.prototype['pluginInit'] = function() {
    var images = this._el.getElementsByTagName('img');
    var self = this;
    goog.array.forEach(images, function(img, idx, array) {
      var res = new annotorious.hypo.ImagePlugin(img, self['annotator']);
      if (self.options.read_only) {
          res.disableSelection();
      }
      self.handlers[img.src] = res;
    });
  }
  
  return AnnotoriousImagePlugin;
})();

