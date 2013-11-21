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
      var date = new Date();
      var temporaryImageID = self._imageAnnotator._image.src + '#' + date.toString();

      var selector =  {
        selector: [{
            type: "ShapeSelector",
            shapeType: event.shape.type,
            geometry: event.shape.geometry,
            source: self._imageAnnotator._image.src
        }]
      };

      var annotation = {
          src: self._imageAnnotator._image.src,
          shapes: [event.shape],
          hypoAnnotation: {
              target: [selector]
          }
      };
      self._annotations[temporaryImageID] = annotation;
      self._imageAnnotator.addAnnotation(annotation);
      self._imageAnnotator.stopSelection();
      self._imagePlugin.annotate(self._imageAnnotator._image.src, event.shape.type, event.shape.geometry, temporaryImageID);
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
            var hypoAnnotation = annotations[index].highlight.annotation;
            hypoAnnotations.push(hypoAnnotation);
        }

        self._imagePlugin.showAnnotations(hypoAnnotations);
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


  AnnotoriousImagePlugin.prototype['addAnnotationFromHighlight'] = function(annotation, image, shape, geometry, style) {
    var handler = this.handlers[annotation.source];

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
    var shape = new annotorious.shape.Shape(shape, subshape, annotorious.shape.Units.FRACTION, style);
    annotation.shapes = [shape];

    // Finally add the annotation to the image annotator
    handler.addAnnotation(annotation);
  }

  AnnotoriousImagePlugin.prototype['deleteAnnotation'] = function(annotation) {
    this.handlers[annotation.source].deleteAnnotation(annotation);
  }

  AnnotoriousImagePlugin.prototype['drawAnnotationHighlight'] = function(annotation) {
    // Sadly, because of canvas cleaning issues, we have to redraw all annotations in the canvas
    var viewer = this.handlers[annotation.source]._imageAnnotator._viewer;
    viewer._g2d.clearRect(0, 0, viewer._canvas.width, viewer._canvas.height);

    for (var ann_index in viewer._annotations) {
        var ann = viewer._annotations[ann_index];
        // The viewer explicitly transforms the shape into a viewPort shape (FRACTION to PIXEL)
        // and stores that shape in an inner-map, we have to use this to call draw.
        var shape = viewer._shapes[annotorious.shape.hashCode(ann.shapes[0])];
        viewer._draw(shape, ann.highlight.active);
    }
  }

/*-------------------------------------------------------------*/
/*-------------------------------------------------------------*/
/*-------------------------------------------------------------*/
/*-------------------------------------------------------------*/
/*-------------------------------------------------------------*/
/*-------------------------------------------------------------*/
/*-------------------------------------------------------------*/
/*-------------------------------------------------------------*/
/*-------------------------------------------------------------*/
/*-------------------------------------------------------------*/

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
    shape.style = this.defaultStyle;
    annotation.shapes = [shape];

    var handler = this.handlers[annotation.source];
    handler.addAnnotation(annotation);
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

  AnnotoriousImagePlugin.prototype['calculateHeatmapPoints'] = function(bucket_size, bucket_threshold_path, above, below, window_height) {
    var self = this;
    var wrapper = self['annotator'].wrapper;
    var defaultView = wrapper[0].ownerDocument.defaultView;

    var images = Array.prototype.slice.call(this._el.getElementsByTagName('img'));
    var points = images.reduce(function(points, img, i) {
        var bound = img.getBoundingClientRect();
        var imagex = bound.top - wrapper.offset().top;
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
                handler._imageAnnotator._viewer._draw(shape, true);
                handlerHasHiglight = true;
            } else {
                handler._imageAnnotator._viewer._draw(shape, false);
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

  AnnotoriousImagePlugin.prototype['collectDynamicBucket'] = function(top, bottom) {
    var visible = []
    for (var image_src in this.handlers) {
        var handler = this.handlers[image_src];
        var bound = handler._image.getBoundingClientRect();
        var imagex = bound.top;
        for (var annotation_id in handler._annotations) {
            var annotation = handler._annotations[annotation_id];
            var hypoAnnotation = annotation.hypoAnnotation;
            var selector = hypoAnnotation.target[0].selector[0];

            var annotationx = 0;
            if (selector.shapeType == 'rect') {
                annotationx = bound.height * selector.geometry.y;
            }

            var annotation_top = imagex + annotationx;
            if (annotation_top >= top && annotation_top <= bottom) {
                visible.push(hypoAnnotation);
            }
        }
    }

    return visible;
  }

  AnnotoriousImagePlugin.prototype['switchHighlightAll'] = function(onoff) {
    for (var image_src in this.handlers) {
        var handler = this.handlers[image_src];
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

            // Set style
            if (onoff) {
                shape.style = this.highlightStyle;
                handler._imageAnnotator._viewer._shapes[annotorious.shape.hashCode(annotation.shapes[0])].style = this.highlightStyle;
            } else  {
                shape.style = this.defaultStyle;
                handler._imageAnnotator._viewer._shapes[annotorious.shape.hashCode(annotation.shapes[0])].style = this.defaultStyle;
            }
            handler._imageAnnotator._viewer._draw(shape, false);


        }
    }
  }

  AnnotoriousImagePlugin.prototype['pluginInit'] = function() {
    var images = this._el.getElementsByTagName('img');

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

