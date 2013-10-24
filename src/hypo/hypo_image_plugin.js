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
    this._annotations = {};

    // Initialize imageAnnotor with our custom Popup
    this._popup = new annotorious.hypo.Popup(image, this._guest, this._eventBroker);
    this._imageAnnotator = new annotorious.mediatypes.image.ImageAnnotator(image, this._popup);
    this._popup.addAnnotator(this._imageAnnotator);

    // Add polygon selector to imageAnnotator
    var poly_selector = new annotorious.plugin.PolygonSelector.Selector();
    poly_selector.init(this._imageAnnotator, this._imageAnnotator._editCanvas);
    this._imageAnnotator._selectors.push(poly_selector);

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
      var date = new Date()
      event.temporaryImageID = self._imageAnnotator._image.src + '#' + date.toString();

      var selector =  {
        selector: [{
            type: "ShapeSelector",
            shapeType: event.shape.type,
            geometry: event.shape.geometry,
            source: self._imageAnnotator._image.src
        }]
      };

      // Generate selector
      self._guest.selectedShape = selector;

      var annotation = {
          src: self._imageAnnotator._image.src,
          shapes: [event.shape],
          hypoAnnotation: {
              target: [selector]
          }
      };
      self._annotations[event.temporaryImageID] = annotation;
      self._imageAnnotator.addAnnotation(annotation);
      self._imageAnnotator.stopSelection();

      self._guest.onAdderClick(event);
    });


    this._imageAnnotator._eventBroker.addHandler(annotorious.events.EventType.SELECTION_CANCELED, function() {
      if (annotorious.events.ui.hasMouse)
        goog.style.showElement(self._imageAnnotator._editCanvas, false);
      self._imageAnnotator._currentSelector.stopSelection();
    });

    var activeCanvas = (annotorious.events.ui.hasTouch) ? this._imageAnnotator._editCanvas : this._imageAnnotator._viewCanvas;
    goog.events.listen(activeCanvas, annotorious.events.ui.EventType.DOWN, function(event) {
        var coords = annotorious.events.ui.sanitizeCoordinates(event, activeCanvas);
        var annotations = self._imageAnnotator.getAnnotationsAt(coords.x, coords.y);

        var hypoAnnotations = [];
        for (var index in annotations) {
            var hypoAnnotation = annotations[index].hypoAnnotation;
            hypoAnnotations.push(hypoAnnotation);
        }

        self._guest.showViewer(hypoAnnotations);
    });

  /**
   * add an annotation to the ImageAnnotator
   * @param annotation: the annotation to add
   */
  annotorious.hypo.ImagePlugin.prototype.addAnnotation = function(annotation) {
    this._imageAnnotator.addAnnotation(annotation);
    this._annotations[annotation.id] = annotation;
  }

  annotorious.hypo.ImagePlugin.prototype.updateAnnotation = function(id, hypoAnnotation) {
      if(!(id in this._annotations)) {
        return;
      }
      var annotation = this._annotations[id];

      // hypoAnnotation.id has been changed (temporary image ID is gone)
      if ('id' in hypoAnnotation && id != hypoAnnotation.id ) {
          this._annotations[hypoAnnotation.id] = annotation;
          delete this._annotations[id];
      }
      annotation.text = hypoAnnotation.text;
      annotation.hypoAnnotation = hypoAnnotation;
  }

  annotorious.hypo.ImagePlugin.prototype.deleteAnnotation = function(id, hypoAnnotation) {
    if(!(id in this._annotations)) {
        return;
    }
    var annotation = this._annotations[id];
    this._imageAnnotator.removeAnnotation(annotation);

    delete this._annotations[id];
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

  AnnotoriousImagePlugin.prototype['addAnnotation'] = function(selector, hypoAnnotation) {
    var annotation = {
        text: hypoAnnotation.text,
        id: hypoAnnotation.id,
        hypoAnnotation: hypoAnnotation
    };
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

  AnnotoriousImagePlugin.prototype['deleteAnnotation'] = function(hypoAnnotation) {
    var source = hypoAnnotation.target[0].selector[0].source;
    var handler = this.handlers[source];
    var id = null;
    if ('id' in hypoAnnotation) { id = hypoAnnotation.id; }
    else { id = hypoAnnotation.temporaryImageID; }

    handler.deleteAnnotation(id, hypoAnnotation);
  }

  AnnotoriousImagePlugin.prototype['updateAnnotation'] = function(hypoAnnotation) {
    var source = hypoAnnotation.target[0].selector[0].source;
    var handler = this.handlers[source];

    var id = null;
    if ('id' in hypoAnnotation) {
      if ('temporaryImageID' in hypoAnnotation) {
          id = hypoAnnotation.temporaryImageID;
          delete hypoAnnotation.temporaryImageID;
      } else { id = hypoAnnotation.id; }
    } else { id = hypoAnnotation.temporaryImageID; }

    handler.updateAnnotation(id, hypoAnnotation);
  }

  AnnotoriousImagePlugin.prototype['calculateHeatmapPoints'] = function(wrapper, defaultView, bucket_size, bucket_threshold_path, above, below, window_height) {
    var self = this;
    var images = Array.prototype.slice.call(this._el.getElementsByTagName('img'));
    var points = images.reduce(function(points, img, i) {
        var bound = img.getBoundingClientRect();
        var imagex = bound.top - wrapper.offset().top - defaultView.pageYOffset;
        var imageh = bound.height;
        //var imagex = $(img).offset().top - wrapper.offset().top - defaultView.pageYOffset;
        //var imageh = $(img).outerHeight(true);

        for (var id in self.handlers[img.src]._annotations) {
            var d = self.handlers[img.src]._annotations[id].hypoAnnotation;
            var selector = d.target[0].selector[0];
            var annotationx = 0;
            var annotationh = 0;
            if (selector.shapeType == 'rect') {
                annotationx = bound.height * selector.geometry.y;
                annotationh = bound.height * selector.geometry.height;
            } else if (selector.shapeType == 'polygon') {
                var minY = 1;
                var maxY = 0;
                for (var index in selector.geometry.points) {
                    var point = selector.geometry.points[index];
                    if (point.y < minY) { minY = point.y};
                    if (point.y > maxY) { maxY = point.y};
                }
                annotationx = bound.height * minY;
                annotationh = bound.height * (maxY - minY);
            }
            var x = imagex + annotationx;
            var h = annotationh;

            if (x <= bucket_size + bucket_threshold_path) {
                if (!(d in above)) { above.push(d); }
            } else if (x + h >= window_height - bucket_size) {
                if (!(d in below)) { below.push(d); }
            } else {
                points.push([x, 1, d]);
                points.push([x + h, -1, d]);
            }
        }

        return points;
    }, []);

    return points;
  }

  AnnotoriousImagePlugin.prototype['setActiveHighlights'] = function(tags, visibleHighlights) {
    for (var image_src in this.handlers) {
        var handler = this.handlers[image_src];
        var handlerHasHiglight = false;
        for (var annotation_id in handler._annotations) {
            var annotation = handler._annotations[annotation_id];
            var shape = annotation.shapes[0];

            // viewer._draw only accepts coordinates in pixels.
            if (shape.units == annotorious.shape.Units.FRACTION) {
              var viewportShape = annotorious.shape.transform(shape, function(xy) {
                return handler._imageAnnotator.fromItemCoordinates(xy);
              });
              shape = viewportShape;
            }

            // Draw the highlights
            if (tags.indexOf(annotation.hypoAnnotation.$$tag) != -1) {
                if (visibleHighlights) {
                    handler._imageAnnotator._viewer._draw(shape, true, true);
                } else {
                    handler._imageAnnotator._viewer._draw(shape, true);
                }
                handlerHasHiglight = true;
            } else {
                if (!visibleHighlights) {
                    handler._imageAnnotator._viewer._draw(shape, false);
                } else {
                    handler._imageAnnotator._viewer._draw(shape, true);
                }
            }
        }

        if (!visibleHighlights) {
            // Draw the higlights
            if (handlerHasHiglight) {
              goog.dom.classes.addRemove(handler._imageAnnotator._viewCanvas, 'annotorious-item-unfocus', 'annotorious-item-focus');
            } else {
              goog.dom.classes.addRemove(handler._imageAnnotator._viewCanvas, 'annotorious-item-focus', 'annotorious-item-unfocus');
            }
        }
    }
  }

  AnnotoriousImagePlugin.prototype['switchHighlightAll'] = function(onoff) {
    for (var image_src in this.handlers) {
        var handler = this.handlers[image_src];
        handler._imageAnnotator._viewer.setVisibleMode(onoff);
        for (var annotation_id in handler._annotations) {
            var annotation = handler._annotations[annotation_id];
            var shape = annotation.shapes[0];

            // viewer._draw only accepts coordinates in pixels.
            if (shape.units == annotorious.shape.Units.FRACTION) {
              var viewportShape = annotorious.shape.transform(shape, function(xy) {
                return handler._imageAnnotator.fromItemCoordinates(xy);
              });
              shape = viewportShape;
            }

            // Draw the highlights
            if (onoff) {
                handler._imageAnnotator._viewer._draw(shape, true);
            } else {
                handler._imageAnnotator._viewer._draw(shape, false);
            }
        }
    }
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

    // Notify us for the changes
    this['annotator'].subscribe('annotationUpdated', function(annotation) {
      if ('target' in annotation) {
          annotation.target.forEach(function(target) {
             if ('selector' in target && target.selector.length > 0) {
                 if (target.selector[0].type == 'ShapeSelector') {
                    self.updateAnnotation(annotation);
                 }
             }
          });
      }
    });

    this['annotator'].subscribe('annotationDeleted', function(annotation) {
      if ('target' in annotation) {
          annotation.target.forEach(function(target) {
             if ('selector' in target && target.selector.length > 0) {
                 if (target.selector[0].type == 'ShapeSelector') {
                    self.deleteAnnotation(annotation);
                 }
             }
          });
      }
    });

  }

  return AnnotoriousImagePlugin;
})();

