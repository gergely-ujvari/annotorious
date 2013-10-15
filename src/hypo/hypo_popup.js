goog.provide('annotorious.hypo.Popup');

/**
 * A wrapper around the Hypo viewer popup, mimicking the Annotorious Popup.
 * @param {element} image the image
 * @param {annotorious.events.EventBroker} eventBroker reference to the Yuma EventBroker
 * @param {Annotator} hypoGuest reference to the Hypothes.is Guest instance
 * @constructor
 */
annotorious.hypo.Popup = function(image, hypoGuest, eventBroker) {
  this.element = goog.soy.renderAsElement(annotorious.templates.popup);

  /** @private **/
  this._text = goog.dom.query('.annotorious-popup-text', this.element)[0];

  /** @private **/
  this._buttons = goog.dom.query('.annotorious-popup-buttons', this.element)[0];

  /** @private **/
  this._image = image;

  /** @private **/
  this._hypoGuest = hypoGuest;

  /** @private **/
  this._eventBroker = eventBroker;

  /** @private **/
  this._annotator = null;

  var self = this;

  if (annotorious.events.ui.hasMouse) {
    goog.events.listen(this.element, goog.events.EventType.MOUSEOVER, function(event) {
      window.clearTimeout(self._buttonHideTimer);
      if (goog.style.getStyle(self._buttons, 'opacity') < 0.9)
        goog.style.setOpacity(self._buttons, 0.9);
      self.clearHideTimer();
    });

    goog.events.listen(this.element, goog.events.EventType.MOUSEOUT, function(event) {
      goog.style.setOpacity(self._buttons, 0);
      self.startHideTimer();
    });

  }

  goog.style.setOpacity(this._buttons, 0);
  goog.style.setOpacity(this.element, 0);
  goog.style.setStyle(this.element, 'pointer-events', 'none');

}

/**
 * Show the popup, loaded with the specified annotation, at the specified coordinates.
 * @param {annotorious.Annotation} annotation the annotation
 * @param {annotorious.shape.geom.Point} xy the viewport coordinate
 */
annotorious.hypo.Popup.prototype.show = function(annotation, xy) {
  this.clearHideTimer();

  if (xy)
    this.setPosition(xy);

  if (annotation)
    this.setAnnotation(annotation);

  if (this._buttonHideTimer)
    window.clearTimeout(this._buttonHideTimer);

  goog.style.setOpacity(this._buttons, 0.9);

  if (annotorious.events.ui.hasMouse) {
    var self = this;
    this._buttonHideTimer = window.setTimeout(function() {
      goog.style.setOpacity(self._buttons, 0);
    }, 1000);
  }

  goog.style.setOpacity(this.element, 0.9);
  goog.style.setStyle(this.element, 'pointer-events', 'auto');
}

/**
 * Start the popup hide timer.
 */
annotorious.hypo.Popup.prototype.startHideTimer = function() {
  this._cancelHide = false;
  if (!this._popupHideTimer) {
    var self = this;
    this._popupHideTimer = window.setTimeout(function() {
      self._annotator.fireEvent(annotorious.events.EventType.BEFORE_POPUP_HIDE, self);
      if (!self._cancelHide) {
        goog.style.setOpacity(self.element, 0.0);
        goog.style.setStyle(self.element, 'pointer-events', 'none');
        goog.style.setOpacity(self._buttons, 0.9);
        delete self._popupHideTimer;
      }
    }, 150);
  }
}

/**
 * Clear the popup hide timer.
 */
annotorious.hypo.Popup.prototype.clearHideTimer = function() {
  this._cancelHide = true;
  if (this._popupHideTimer) {
    window.clearTimeout(this._popupHideTimer);
    delete this._popupHideTimer;
  }
}


/**
 * Add annotator reference
 */
annotorious.hypo.Popup.prototype.addAnnotator = function(annotator) {
    this._annotator = annotator;
    goog.dom.appendChild(this._annotator.element, this.element);
    var self = this;
    this._annotator.addHandler(annotorious.events.EventType.MOUSE_OUT_OF_ANNOTATABLE_ITEM, function(event) {
      self.startHideTimer();
    });
}


/**
 * Set the position of the popup.
 * @param {annotorious.shape.geom.Point} xy the viewport coordinate
 */
annotorious.hypo.Popup.prototype.setPosition = function(xy) {
  goog.style.setPosition(this.element, new goog.math.Coordinate(xy.x, xy.y));
}


/**
 * Set the annotation for the popup.
 * @param {annotorious.Annotation} annotation the annotation
 */
annotorious.hypo.Popup.prototype.setAnnotation = function(annotation) {
  this._currentAnnotation = annotation;
  if (annotation.text)
    this._text.innerHTML = annotation.text.replace(/\n/g, '<br/>');
  else
    this._text.innerHTML = '<span class="annotorious-popup-empty">No comment</span>';

  goog.style.showElement(this._buttons, false);
}

