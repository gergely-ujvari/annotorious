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
 * @param {Object} Annotator.Plugin.ImageAnchors reference
 * @constructor
 */
annotorious.hypo.ImagePlugin = function(image, imagePlugin) {
    this._image = image;
    this._eventBroker = new annotorious.events.EventBroker();
    this._imagePlugin = imagePlugin;
    this._annotations = {};

    // Initialize imageAnnotor with our custom Popup
    this._popup = new annotorious.hypo.Popup(image, this._imagePlugin, this._eventBroker);
    this._imageAnnotator = new annotorious.mediatypes.image.ImageAnnotator(image, this._popup);
    this._popup.addAnnotator(this._imageAnnotator);

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
    this._imageAnnotator._eventBroker.addHandler(annotorious.events.EventType.SELECTION_COMPLETED, function(event) {
      // Generate temporary id for the annotation
      self.maybeClicked = false;
      var date = new Date();
      var temporaryImageID = self._imageAnnotator._image.src + '#' + date.toString();

      var annotation = {
          src: self._imageAnnotator._image.src,
          shapes: [event.shape],
          temporaryID: temporaryImageID
      };
      self._imageAnnotator.addAnnotation(annotation);
      self._imageAnnotator.stopSelection();
      self._imagePlugin.annotate(self._imageAnnotator._image.src, event.shape.type, event.shape.geometry, temporaryImageID);
    });


    this._imageAnnotator._eventBroker.addHandler(annotorious.events.EventType.SELECTION_CANCELED, function() {
      if (self.maybeClicked) {
        var coords = annotorious.events.ui.sanitizeCoordinates(self.clickEvent, activeCanvas);
        var annotations = self._imageAnnotator.getAnnotationsAt(coords.x, coords.y);

        var hypoAnnotations = [];
        for (var index in annotations) {
            var hypoAnnotation = annotations[index].highlight.annotation;
            hypoAnnotations.push(hypoAnnotation);
        }

        self._imagePlugin.showAnnotations(hypoAnnotations);
      }

      if (annotorious.events.ui.hasMouse)
        goog.style.showElement(self._imageAnnotator._editCanvas, false);
      self._imageAnnotator._currentSelector.stopSelection();
    });

    this._imageAnnotator._eventBroker.addHandler(annotorious.events.EventType.SELECTION_STARTED, function() {
        self.maybeClicked = true;
    });

    var activeCanvas = (annotorious.events.ui.hasTouch) ? this._imageAnnotator._editCanvas : this._imageAnnotator._viewCanvas;

    goog.events.listen(activeCanvas, annotorious.events.ui.EventType.DOWN, function(event) {
        self.clickEvent = event;
    });

  /**
   * add an annotation to the ImageAnnotator
   * @param annotation: the annotation to add
   */
  annotorious.hypo.ImagePlugin.prototype.addAnnotation = function(annotation) {
    this._imageAnnotator.addAnnotation(annotation);
  }

  annotorious.hypo.ImagePlugin.prototype.deleteAnnotation = function(annotation) {
    this._imageAnnotator.removeAnnotation(annotation);
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
window['Annotorious'] = {};
window['Annotorious']['ImagePlugin'] = (function() {
  function AnnotoriousImagePlugin(element, options, imagePlugin, imagelist) {
    this._el = element;
    this.options = options;
    this.imagePlugin = imagePlugin;

    this.handlers = {};

    var self = this;
    goog.array.forEach(imagelist, function(img, idx, array) {
      var res = new annotorious.hypo.ImagePlugin(img, self['imagePlugin']);
      if (self.options.read_only) {
          res.disableSelection();
      }
      self.handlers[img.src] = res;
    });
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

  AnnotoriousImagePlugin.prototype['updateAnnotationAfterCreatingAnnotatorHighlight'] = function(annotation) {
    var handler = this.handlers[annotation.source];
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
            this._calculateHeatmapGeometry(ann, handler._image);
            break;
        }
    }
    return found;
  }

  AnnotoriousImagePlugin.prototype['addAnnotationFromHighlight'] = function(annotation, image, shape, geometry, style) {
    var handler = this.handlers[annotation.source];

    shape = this._createShapeForAnnotation(shape, geometry, style);
    annotation.shapes = [shape];
    this._calculateHeatmapGeometry(annotation, handler._image);

    // Finally add the annotation to the image annotator
    handler.addAnnotation(annotation);
  }

  AnnotoriousImagePlugin.prototype['deleteAnnotation'] = function(annotation) {
    this.handlers[annotation.source].deleteAnnotation(annotation);
  }

  AnnotoriousImagePlugin.prototype['drawAnnotationHighlight'] = function(annotation, visibleHighlights) {
    // Sadly, because of canvas cleaning issues, we have to redraw all annotations in the canvas
    var viewer = this.handlers[annotation.source]._imageAnnotator._viewer;
    viewer._g2d.clearRect(0, 0, viewer._canvas.width, viewer._canvas.height);

    this.addRemoveImageFocus(annotation.source, true);
    var drawn = false;
    for (var ann_index in viewer._annotations) {
        var ann = viewer._annotations[ann_index];
        if (ann.highlight.active || visibleHighlights) {
            // The viewer explicitly transforms the shape into a viewPort shape (FRACTION to PIXEL)
            // and stores that shape in an inner-map, we have to use this to call draw.
            var shape = viewer._shapes[annotorious.shape.hashCode(ann.shapes[0])];
            viewer._draw(shape, ann.highlight.active);
            drawn = true;
        }
    }
    if (!drawn) this.addRemoveImageFocus(annotation.source, false);
  }

  AnnotoriousImagePlugin.prototype['getImageForAnnotation'] = function(annotation) {
    return this.handlers[annotation.source]._image;
  }

  AnnotoriousImagePlugin.prototype['updateShapeStyle'] = function(annotation, style) {
    var viewer = this.handlers[annotation.source]._imageAnnotator._viewer;
    var shape = viewer._shapes[annotorious.shape.hashCode(annotation.shapes[0])];
    annotation.shapes[0].style = style;
    shape.style = style;
  }

  AnnotoriousImagePlugin.prototype['addRemoveImageFocus'] = function(imageSource, focus) {
    var handler = this.handlers[imageSource];
    if (focus) {
      goog.dom.classes.addRemove(handler._imageAnnotator._viewCanvas, 'annotorious-item-unfocus', 'annotorious-item-focus');
    } else {
      goog.dom.classes.addRemove(handler._imageAnnotator._viewCanvas, 'annotorious-item-focus', 'annotorious-item-unfocus');
    }
  }

  return AnnotoriousImagePlugin;
})();

