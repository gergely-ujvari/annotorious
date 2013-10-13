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

/**
 * Implementation of the Yuma image plugin for Hypothes.is.
 * @param {Element} image the image to be annotated
 * @param {Object} Hyptohes.is guest reference to the embedded guest instance
 * @constructor
 */
annotorious.hypo.ImagePlugin = function(image, guest) {
  /** @inheritDoc **/
  annotorious.hypo.ImagePlugin.prototype._transferStyles = function(image, annotationLayer) {
    return annotorious.mediatypes.image.ImageAnnotator.prototype._transferStyles(image, annotationLayer);
  }

  /**
   * Adds a lifecycle event handler to this annotator's Event Broker.
   * @param {annotorious.events.EventType} type the event type
   * @param {Function} handler the handler function
   */
  annotorious.hypo.ImagePlugin.prototype.addHandler = function(type, handler) {
    this._eventBroker.addHandler(type, handler);
  }

  /**
   * Adds an annotation to this annotator's viewer.
   * @param {annotorious.Annotation} annotation the annotation
   * @param {annotorious.Annotation=} opt_replace optionally, an existing annotation to replace
   */
  annotorious.hypo.ImagePlugin.prototype.addAnnotation = function(annotation, opt_replace) {
    this._viewer.addAnnotation(annotation, opt_replace);
  }

  /**
   * Fire an event on this annotator's Event Broker.
   * @param {annotorious.events.EventType} type the event type
   * @param {Object} event the event object
  */
  annotorious.hypo.ImagePlugin.prototype.fireEvent = function(type, event) {
    return this._eventBroker.fireEvent(type, event);
  }

  /**
   * Converts the specified viewport coordinate to the
   * coordinate system used by the annotatable item.
   * @param {annotorious.shape.geom.Point} xy the viewport coordinate
  * @returns the corresponding item coordinate
  */
  annotorious.hypo.ImagePlugin.prototype.fromItemCoordinates = function(xy) {
    var imgSize = goog.style.getSize(this._image);
    return { x: xy.x * imgSize.width, y: xy.y * imgSize.height };
  }

  /**
   * Converts the specified coordinate from the
   * coordinate system used by the annotatable item to viewport coordinates.
   * @param {annotorious.shape.geom.Point} xy the item coordinate
   * @returns the corresponding viewport coordinate
   */
  annotorious.hypo.ImagePlugin.prototype.toItemCoordinates = function(xy) {
    var imgSize = goog.style.getSize(this._image);
    return { x: xy.x / imgSize.width, y: xy.y / imgSize.height };
  }

  /**
   * Returns the available selectors for this item.
   * @returns {Array.<Object>} the list of selectors
   */
  annotorious.hypo.ImagePlugin.prototype.getAvailableSelectors = function() {
    return this._selectors;
  }

  /**
   * Returns the annotations at the specified client X/Y coordinates.
   * @param {number} cx the client X coordinate
   * @param {number} cy the client Y coordinate
   * @return {Array.<annotorious.Annotation>} the annotations sorted by size, smallest first
   */
  annotorious.hypo.ImagePlugin.prototype.getAnnotationsAt = function(cx, cy) {
    return goog.array.clone(this._viewer.getAnnotationsAt(cx, cy));
  }

  /**
   * Stops the selection (if any).
   * @param {annotorious.Annotation=} opt_original_annotation the original annotation being edited (if any)
   */
  annotorious.hypo.ImagePlugin.prototype.stopSelection = function(opt_original_annotation) {
     if (annotorious.events.ui.hasMouse)
       goog.style.showElement(this._editCanvas, false);

     this._currentSelector.stopSelection();

     // If this was an edit of an annotation (rather than creation of a new one) re-add to viewer!
     if (opt_original_annotation)
       this._viewer.addAnnotation(opt_original_annotation);
  }

  this._image = image;

  /** The container DOM element (DIV) for the annotation layer **/
  this.element;

  /** The popup for this annotator (public for use by plugins) **/
  this.popup;

  /** @private **/
  this._editCanvas;

  /** @private **/
  this._viewCanvas;

  /** @private **/
  this._viewer;

  /** @private **/
  this._eventBroker = new annotorious.events.EventBroker();

  /** @private **/
  this._selectors = [];

  /** @private **/
  this._currentSelector;

  /** @private **/
  this._selectionEnabled = true;

  this.element = goog.dom.createDom('div', 'annotorious-annotationlayer');
  goog.style.setStyle(this.element, 'position', 'relative');
  goog.style.setStyle(this.element, 'display', 'inline-block');
  this._transferStyles(image, this.element);

  var img_bounds = goog.style.getBounds(image);
  goog.style.setSize(this.element, img_bounds.width, img_bounds.height);
  goog.dom.replaceNode(this.element, image);
  goog.dom.appendChild(this.element, image);

  this._viewCanvas = goog.soy.renderAsElement(annotorious.templates.image.canvas,
    { width:img_bounds.width, height:img_bounds.height });
  // Maybe not needed?
  if (annotorious.events.ui.hasMouse)
    goog.dom.classes.add(this._viewCanvas, 'annotorious-item-unfocus');
  goog.dom.appendChild(this.element, this._viewCanvas);

  this._editCanvas = goog.soy.renderAsElement(annotorious.templates.image.canvas,
    { width:img_bounds.width, height:img_bounds.height });

  if (annotorious.events.ui.hasMouse)
    goog.style.showElement(this._editCanvas, false);
  goog.dom.appendChild(this.element, this._editCanvas);

  this.popup = new annotorious.Popup(this);

  var default_selector = new annotorious.plugins.selection.RectDragSelector();
  default_selector.init(this._editCanvas, this);
  this._selectors.push(default_selector);

  var poly_selector = new annotorious.plugins.PolygonSelector.Selector();
  poly_selector.init(this, this._editCanvas);
  this._selectors.push(poly_selector);

  this._currentSelector = poly_selector;
  //this._currentSelector = default_selector;

  this._viewer = new annotorious.mediatypes.image.Viewer(this._viewCanvas, this);

  var self = this;

  if (annotorious.events.ui.hasMouse) {
    goog.events.listen(this.element, annotorious.events.ui.EventType.OVER, function(event) {
      var relatedTarget = event.relatedTarget;
      if (!relatedTarget || !goog.dom.contains(self.element, relatedTarget)) {
        self._eventBroker.fireEvent(annotorious.events.EventType.MOUSE_OVER_ANNOTATABLE_ITEM);
        goog.dom.classes.addRemove(self._viewCanvas, 'annotorious-item-unfocus', 'annotorious-item-focus');
      }
    });

    goog.events.listen(this.element, annotorious.events.ui.EventType.OUT, function(event) {
      var relatedTarget = event.relatedTarget;
      if (!relatedTarget || !goog.dom.contains(self.element, relatedTarget)) {
        self._eventBroker.fireEvent(annotorious.events.EventType.MOUSE_OUT_OF_ANNOTATABLE_ITEM);
        goog.dom.classes.addRemove(self._viewCanvas, 'annotorious-item-focus', 'annotorious-item-unfocus');
      }
    });
  }

  var activeCanvas = (annotorious.events.ui.hasTouch) ? this._editCanvas : this._viewCanvas;
  goog.events.listen(activeCanvas, annotorious.events.ui.EventType.DOWN, function(event) {
    var coords = annotorious.events.ui.sanitizeCoordinates(event, activeCanvas);
    self._viewer.highlightAnnotation(undefined);

    if (self._selectionEnabled) {
      goog.style.showElement(self._editCanvas, true);
      self._currentSelector.startSelection(coords.x, coords.y);
    } else {
      var annotations = self._viewer.getAnnotationsAt(coords.x, coords.y);
      if (annotations.length > 0)
        self._viewer.highlightAnnotation(annotations[0]);
    }
  });

  this._eventBroker.addHandler(annotorious.events.EventType.SELECTION_COMPLETED, function(event) {
    console.log(event.shape);

    guest.selectedShape = {
        selector: [{
            type: "ShapeSelector",
            shapeType: event.shape.type,
            geometry: event.shape.geometry,
            source: image.src
        }]
    };

    guest.onAdderClick(event);
    var annotation = { src: image.src, shapes: [event.shape] };
    self.addAnnotation(annotation);
    self.stopSelection();
  });

  this._eventBroker.addHandler(annotorious.events.EventType.SELECTION_CANCELED, function() {
    if (annotorious.events.ui.hasMouse)
      goog.style.showElement(self._editCanvas, false);
    self._currentSelector.stopSelection();
  });
}

/**
 * HYPO plugin interface.
 */
window['Annotator']['Plugin']['AnnotoriousImagePlugin'] = (function() {

  function AnnotoriousImagePlugin(element, options) {    
    this._el = element;
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
    //annotorious.addPlugin('PolygonSelector', { activate: true })
    var images = this._el.getElementsByTagName('img');
    var self = this;
    goog.array.forEach(images, function(img, idx, array) {
      //new annotorious.mediatypes.image.ImageAnnotator(img);
      var res = new annotorious.hypo.ImagePlugin(img, self['annotator']);
      self.handlers[img.src] = res;
    });
  }
  
  return AnnotoriousImagePlugin;
})();

