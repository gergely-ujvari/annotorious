var humanEvents = annotorious.events.ui.EventType;

goog.provide('annotorious.okfn.ImagePlugin');

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
 * Implementation of the Yuma image plugin for Okfn Annotator.
 * @param {Element} image the image to be annotated
 * @param {Object} Annotator.Plugin.ImageAnchors reference
 * @constructor
 */
annotorious.okfn.ImagePlugin = function(image, index, imagePlugin, wrapperElement) {
    this._image = image;
    this._index = index;
    this._eventBroker = new annotorious.events.EventBroker();
    this._imagePlugin = imagePlugin;
    this._annotations = {};
    this._wrapperElement = wrapperElement;
    this._annotationsUnderthePointer = [];

    // Initialize imageAnnotator with our custom Popup
    this._popup = new annotorious.okfn.Popup(image,  this._eventBroker, this._wrapperElement);
    this._imageAnnotator = new annotorious.mediatypes.image.ImageAnnotator(image, this._popup);
    this._popup.addAnnotator(this._imageAnnotator);
    this._imageAnnotator._hint.destroy();
    this._hint = new annotorious.okfn.Hint(this._imageAnnotator, wrapperElement);
    this._imageAnnotator._hint = this._hint;

    /*
    // Add polygon selector to imageAnnotator
    var poly_selector = new annotorious.plugin.PolygonSelector.Selector();
    poly_selector.init(this._imageAnnotator, this._imageAnnotator._editCanvas);
    this._imageAnnotator._selectors.push(poly_selector);
    */
    var fancybox_selector = new annotorious.plugin.FancyBoxSelector.Selector();
    fancybox_selector.init(this._imageAnnotator, this._imageAnnotator._editCanvas);
    this._imageAnnotator._selectors.push(fancybox_selector);

    this._imageAnnotator._currentSelector = fancybox_selector;
    //this._imageAnnotator._currentSelector = poly_selector;

    var self = this;

    // Remove the default selection handlers
    var selectionHandler = this._imageAnnotator._eventBroker._handlers[annotorious.events.EventType.SELECTION_COMPLETED][0];
    var cancelHandler = this._imageAnnotator._eventBroker._handlers[annotorious.events.EventType.SELECTION_CANCELED][0];
    this._imageAnnotator._eventBroker.removeHandler(annotorious.events.EventType.SELECTION_COMPLETED, selectionHandler);
    this._imageAnnotator._eventBroker.removeHandler(annotorious.events.EventType.SELECTION_CANCELED, cancelHandler);

    // Add selection handlers
    this._newSelectionHandler = function(event) {
      // Generate temporary id for the annotation
      self.maybeClicked = false;
      var date = new Date();
      var temporaryImageID = self._imageAnnotator._image.src + '#' + date.toString();

      var annotation = {
          shapes: [event.shape],
          temporaryID: temporaryImageID,
          image: self._imageAnnotator._image
      };

      self._imageAnnotator.addAnnotation(annotation);
      self._imageAnnotator.stopSelection();
      self._imagePlugin.annotate(self._imageAnnotator._image, self._index, event.shape.type, event.shape.geometry, temporaryImageID, annotation);
    }
    this._imageAnnotator._eventBroker.addHandler(annotorious.events.EventType.SELECTION_COMPLETED, this._newSelectionHandler);

    this._newCancelHandler = function() {
      if (self.maybeClicked) {
        var coords = annotorious.events.ui.sanitizeCoordinates(self.clickEvent, activeCanvas);
        var annotations = self._imageAnnotator.getAnnotationsAt(coords.x, coords.y);

        var okfnAnnotations = [];
        for (var index in annotations) {
            var okfnAnnotation = annotations[index].highlight.annotation;
            okfnAnnotations.push(okfnAnnotation);
        }

        self._imagePlugin.showAnnotations(okfnAnnotations);
      }

      if (annotorious.events.ui.hasMouse)
        goog.style.showElement(self._imageAnnotator._editCanvas, false);
      self._imageAnnotator._currentSelector.stopSelection();
    }
    this._imageAnnotator._eventBroker.addHandler(annotorious.events.EventType.SELECTION_CANCELED, this._newCancelHandler);

    this._newSelectionStartedHandler = function() {
        self.maybeClicked = true;
    }
    this._imageAnnotator._eventBroker.addHandler(annotorious.events.EventType.SELECTION_STARTED, this._newSelectionStartedHandler);

    var activeCanvas = (annotorious.events.ui.hasTouch) ? this._imageAnnotator._editCanvas : this._imageAnnotator._viewCanvas;

    this._eventDownListener = goog.events.listen(activeCanvas, annotorious.events.ui.EventType.DOWN, function(event) {
        self.clickEvent = event;
    });

    this._eventMoveListener =goog.events.listen(activeCanvas, annotorious.events.ui.EventType.MOVE, function(event) {
        var coords = annotorious.events.ui.sanitizeCoordinates(event, activeCanvas);
        var annotations = self._imageAnnotator.getAnnotationsAt(coords.x, coords.y);

        var okfnAnnotations = [];
        annotations.forEach(function(annotation) {
            var okfnAnnotation = annotation.highlight.annotation;
            okfnAnnotations.push(okfnAnnotation);
        });

        // These are the annotations that has "mouseout"
        var restAnnotations = self._annotationsUnderthePointer.filter(function(ann) {
            return annotations.indexOf(ann) == -1;
        });

        self._imagePlugin.mouseOverAnnotations(okfnAnnotations);
        self._imagePlugin.mouseOutAnnotations(restAnnotations);

        self._annotationsUnderthePointer = annotations;
    });

  /**
   * add an annotation to the ImageAnnotator
   * @param annotation: the annotation to add
   */
  annotorious.okfn.ImagePlugin.prototype.addAnnotation = function(annotation) {
    this._imageAnnotator.addAnnotation(annotation);
  }

  annotorious.okfn.ImagePlugin.prototype.deleteAnnotation = function(annotation) {
    this._imageAnnotator.removeAnnotation(annotation);
  }

  annotorious.okfn.ImagePlugin.prototype.disableSelection = function() {
      this._imageAnnotator._selectionEnabled = false;
      this._imageAnnotator._hint = null;
  }

  annotorious.okfn.ImagePlugin.prototype.destroy = function() {
      goog.events.unlistenByKey(this._eventDownListener);
      goog.events.unlistenByKey(this._eventMoveListener);

      this._imageAnnotator._eventBroker.removeHandler(annotorious.events.EventType.SELECTION_COMPLETED, this._newSelectionHandler);
      this._imageAnnotator._eventBroker.removeHandler(annotorious.events.EventType.SELECTION_STARTED, this._newSelectionStartedHandler);
      this._imageAnnotator._eventBroker.removeHandler(annotorious.events.EventType.SELECTION_CANCELED, this._newCancelHandler);

      this._imageAnnotator._hint.destroy();
      this._imageAnnotator.destroy();
  }
}

/**
 * Okfn plugin interface.
 */
window['Annotorious'] = {};
window['Annotorious']['ImagePlugin'] = (function() {
  function AnnotoriousImagePlugin(element, options, imagePlugin) {
    this._el = element;
    this.options = options;
    this.imagePlugin = imagePlugin;

    this.handlers = {};
    this._temporalAnnotations = {};

    var self = this;
  }

  AnnotoriousImagePlugin.prototype['addImage'] = function(newImage, index) {
      var self = this;
      var setupFunction = function() {
          var res = new annotorious.okfn.ImagePlugin(newImage, index, self['imagePlugin'], self['_el']);
          if (self.options.read_only) {
            res.disableSelection();
          }
          self.handlers[newImage] = res;
          if (self._temporalAnnotations[newImage]) {
            self._temporalAnnotations[newImage].forEach(function(ann) {
                 self._addAnnotationFromHighlight(ann.annotation, ann.image, ann.shape, ann.geometry, ann.style);
            });

            self._temporalAnnotations[newImage] = [];
          }
      }

      // We cannot be sure if the image is already loaded or not.
      if (newImage.complete) setupFunction();
      else newImage.addEventListener('load', setupFunction);
  }

  AnnotoriousImagePlugin.prototype['getHighlightsForImage'] = function(image) {
    var highlights = [];
    var handler = this.handlers[image];
    if (handler) {
        handler._imageAnnotator._viewer._annotations.forEach(function(ann) {
            highlights.push(ann.highlight);
        })
    }

    return highlights;
  }

  AnnotoriousImagePlugin.prototype['removeImage'] = function(image) {
    var handler = this.handlers[image];
    if (handler) {
        handler.destroy();
        delete this.handlers[image];
    }
  }

  AnnotoriousImagePlugin.prototype['_createShapeForAnnotation'] = function(shape, geometry, style) {
    // Create the corresponding subshape object
    var subshape = null;
    if (shape == 'rect') {
      subshape = new annotorious.shape.geom.Rectangle(
          geometry.x, geometry.y,
          geometry.width, geometry.height);
    } else {
        if (shape == 'polygon') {
          subshape = new annotorious.shape.geom.Polygon(geometry.points);
        }
    }

    // Create the shape object
    return new annotorious.shape.Shape(shape, subshape, annotorious.shape.Units.FRACTION, style);
  }

  AnnotoriousImagePlugin.prototype['_calculateHeatmapGeometry'] = function(annotation, image) {
    var bound = image.getBoundingClientRect();
    var shape = annotation.shapes[0];
    annotation.heatmapGeometry = {};
    if (shape.type == 'rect') {
        annotation.heatmapGeometry.y = bound.height * shape.geometry.y;
        annotation.heatmapGeometry.h = bound.height * shape.geometry.height;
    } else if (shape.type == 'polygon') {
        var minY = 1;
        var maxY = 0;
        for (var index in shape.geometry.points) {
            var point = shape.geometry.points[index];
            if (point.y < minY) { minY = point.y};
            if (point.y > maxY) { maxY = point.y};
        }
        annotation.heatmapGeometry.y = bound.height * minY;
        annotation.heatmapGeometry.h = bound.height * (maxY - minY);
    }
  }

  AnnotoriousImagePlugin.prototype['updateAnnotationAfterCreatingAnnotatorHighlight'] = function(annotation, image) {
    var handler = this.handlers[image];
    var viewer = handler._imageAnnotator._viewer;
    var found = null;

    // This is a newly created annotation from selection
    for (var ann_index in viewer._annotations) {
        var ann = viewer._annotations[ann_index];
        if (ann.temporaryID == annotation.temporaryID) {
            found = ann;

            // Found our annotation
            ann.text = annotation.text;
            ann.id = annotation.id;
            ann.temporaryID = undefined;
            ann.source = annotation.source;
            ann.highlight = annotation.highlight;
            this._calculateHeatmapGeometry(ann, image);
            break;
        }
    }

    if (!found) {
        found = annotation;
        found._bad = true;
    }
    return found;
  }
  AnnotoriousImagePlugin.prototype['addAnnotationFromHighlight'] = function(annotation, image, shape, geometry, style) {
    var handler = this.handlers[image];
    if (handler) {
      this._addAnnotationFromHighlight(annotation, image, shape, geometry, style);
    } else {
      // We handler is not ready yet, save it for later
      this._saveAnnotationTemporarily(annotation, image, shape, geometry, style);
    }
  }

  AnnotoriousImagePlugin.prototype['_saveAnnotationTemporarily'] = function(annotation, image, shape, geometry, style) {
    if (!this._temporalAnnotations[image]) {
       this._temporalAnnotations[image] = [];
    }

    this._temporalAnnotations[image].push({
        annotation: annotation,
        image: image,
        shape: shape,
        geometry: geometry,
        style: style
    });
  }

  AnnotoriousImagePlugin.prototype['_addAnnotationFromHighlight'] = function(annotation, image, shape, geometry, style) {
    var handler = this.handlers[image];

    shape = this._createShapeForAnnotation(shape, geometry, style);
    annotation.shapes = [shape];
    this._calculateHeatmapGeometry(annotation, handler._image);

    // Finally add the annotation to the image annotator
    handler.addAnnotation(annotation);
  }

  AnnotoriousImagePlugin.prototype['deleteAnnotation'] = function(annotation) {
    this.handlers[annotation.image].deleteAnnotation(annotation);
  }

  AnnotoriousImagePlugin.prototype['drawAnnotationHighlights'] = function(image, visibleHighlights) {
    // Sadly, because of canvas cleaning issues, we have to redraw all annotations in the canvas
    var viewer = this.handlers[image]._imageAnnotator._viewer;
    viewer._g2d.clearRect(0, 0, viewer._canvas.width, viewer._canvas.height);

    this.addRemoveImageFocus(image, true);
    var drawn = false;

    viewer._annotations.forEach(function(ann) {
        if (ann.highlight.active || visibleHighlights) {
            // The viewer explicitly transforms the shape into a viewPort shape (FRACTION to PIXEL)
            // and stores that shape in an inner-map, we have to use this to call draw.
            var shape = viewer._shapes[annotorious.shape.hashCode(ann.shapes[0])];
            viewer._draw(shape, ann.highlight.active);
            drawn = true;
        }
    });
    if (!drawn) this.addRemoveImageFocus(image, false);
  }

  AnnotoriousImagePlugin.prototype['updateShapeStyle'] = function(image, annotation, style) {
    var viewer = this.handlers[image]._imageAnnotator._viewer;
    var shape = viewer._shapes[annotorious.shape.hashCode(annotation.shapes[0])];
    annotation.shapes[0].style = style;
    shape.style = style;
  }

  AnnotoriousImagePlugin.prototype['addRemoveImageFocus'] = function(image, focus) {
    var handler = this.handlers[image];
    if (focus) {
      goog.dom.classes.addRemove(handler._imageAnnotator._viewCanvas, 'annotorious-item-unfocus', 'annotorious-item-focus');
    } else {
      goog.dom.classes.addRemove(handler._imageAnnotator._viewCanvas, 'annotorious-item-focus', 'annotorious-item-unfocus');
    }
  }

  return AnnotoriousImagePlugin;
})();

