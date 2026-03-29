/**
 * Contact form handler — validates and submits to Lambda Function URL
 */
(function() {
  var LAMBDA_URL = 'https://c3exk2htq5.execute-api.ap-south-1.amazonaws.com/contact';

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function validateMobile(mobile) {
    var cleaned = mobile.replace(/[\s\-()]/g, '');
    // Accept: 10 digits, 0+10 digits, +91+10 digits
    return /^(\d{10}|0\d{10}|\+91\d{10})$/.test(cleaned);
  }

  function showMessage(form, msg, isError) {
    var existing = form.querySelector('.form-message');
    if (existing) existing.remove();
    var div = document.createElement('div');
    div.className = 'form-message';
    div.style.cssText = 'padding:0.75rem 1rem;margin:0.75rem 0;border-radius:0.25rem;font-size:0.875rem;font-family:Montserrat,sans-serif;';
    div.style.backgroundColor = isError ? '#fde8e8' : '#e8f5e9';
    div.style.color = isError ? '#c62828' : '#2e7d32';
    div.textContent = msg;
    var btn = form.querySelector('.send-btn, .mdc-button');
    if (btn) btn.parentElement.insertBefore(div, btn);
    else form.appendChild(div);
  }

  function submitForm(form) {
    var name = form.querySelector('[name="name"], [placeholder="Enter your name..."]');
    var firstName = form.querySelector('[placeholder="First Name"]');
    var lastName = form.querySelector('[placeholder="Last Name"]');
    var email = form.querySelector('[name="email"], [placeholder="Enter your email..."], [placeholder="Email"]');
    var mobile = form.querySelector('[name="contact_mobile"], [name="mobile"][placeholder*="Mobile"], [placeholder*="Mobile" i]');
    var subject = form.querySelector('[name="subject"], [placeholder*="Subject" i]');
    var message = form.querySelector('textarea');
    var honeypot = form.querySelector('[name="_gotcha"]');
    var page = window.location.pathname;

    // Combine first+last name if separate fields
    var nameVal = '';
    if (name) { nameVal = name.value.trim(); }
    else if (firstName) { nameVal = (firstName.value.trim() + ' ' + (lastName ? lastName.value.trim() : '')).trim(); }

    // Validate
    if (!nameVal) { showMessage(form, 'Please enter your name.', true); return; }

    var emailVal = email ? email.value.trim() : '';
    var mobileVal = mobile ? mobile.value.trim() : '';

    if (!emailVal && !mobileVal) {
      showMessage(form, 'Please provide either email or mobile number.', true);
      return;
    }
    if (emailVal && !validateEmail(emailVal)) {
      showMessage(form, 'Please enter a valid email address.', true);
      return;
    }
    if (mobileVal && !validateMobile(mobileVal)) {
      showMessage(form, 'Please enter a valid mobile number (7-15 digits).', true);
      return;
    }
    if (!message || !message.value.trim()) {
      showMessage(form, 'Please enter a message.', true);
      return;
    }

    // Honeypot
    if (honeypot && honeypot.value) return;

    var data = {
      name: nameVal,
      email: emailVal || undefined,
      mobile: mobileVal || undefined,
      subject: subject ? subject.value.trim() : undefined,
      message: message.value.trim(),
      page: page,
    };

    // Disable button
    var btn = form.querySelector('.send-btn, .mdc-button');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }

    fetch(LAMBDA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    .then(function(res) { return res.json(); })
    .then(function(result) {
      if (result.success) {
        showMessage(form, result.message || 'Thank you! Your message has been sent.', false);
        form.querySelectorAll('input, textarea').forEach(function(el) { if (el.name !== '_gotcha') el.value = ''; });
      } else {
        showMessage(form, result.error || 'Something went wrong.', true);
      }
    })
    .catch(function() {
      showMessage(form, 'Network error. Please try again.', true);
    })
    .finally(function() {
      if (btn) { btn.disabled = false; btn.textContent = 'SEND MESSAGE'; }
    });
  }

  // Attach to all forms with SEND MESSAGE or Send button
  document.addEventListener('DOMContentLoaded', function() {
    // Disable send buttons until email or mobile is provided
    function setupButtonToggle(form) {
      var email = form.querySelector('[name="email"], [placeholder="Enter your email..."], [placeholder="Email"]');
      var mobile = form.querySelector('[name="mobile"]');
      var btn = form.querySelector('.submit-btn, .mdc-button');
      if (!btn) return;

      var label = btn.querySelector('.mdc-button__label');
      if (!label) return;

      function checkFields() {
        var emailVal = email ? email.value.trim() : '';
        var mobileVal = mobile ? mobile.value.trim() : '';
        var hasContact = emailVal.length > 0 || mobileVal.length > 0;
        btn.disabled = !hasContact;
        btn.style.opacity = hasContact ? '1' : '0.5';
      }

      if (email) email.addEventListener('input', checkFields);
      if (mobile) mobile.addEventListener('input', checkFields);
      checkFields(); // initial state
    }

    // Contact page form
    document.querySelectorAll('.contact-us, .contact-form, [class*="contact"]').forEach(function(section) {
      var btn = section.querySelector('.mdc-button, .submit-btn');
      if (!btn) return;
      var label = btn.querySelector('.mdc-button__label');
      if (!label || (!label.textContent.includes('SEND') && !label.textContent.includes('Send'))) return;

      btn.addEventListener('click', function(e) {
        e.preventDefault();
        submitForm(section);
      });

      setupButtonToggle(section);
    });

    // Products page enquiry form (has submit-btn with "Send" label)
    document.querySelectorAll('form .submit-btn').forEach(function(btn) {
      var label = btn.querySelector('.mdc-button__label');
      if (!label || label.textContent.trim() !== 'Send') return;
      var form = btn.closest('form') || btn.parentElement;

      // Add OR + Mobile field after Email
      var emailInput = form.querySelector('input[placeholder="Email"]');
      if (emailInput && !form.querySelector('.or-label')) {
        var emailCell = emailInput.closest('.mdc-layout-grid__cell') || emailInput.closest('.mdc-text-field');
        if (emailCell) {
          var orLabel = document.createElement('div');
          orLabel.className = 'mdc-layout-grid__cell mdc-layout-grid__cell--span-12-desktop mdc-layout-grid__cell--span-8-tablet or-label';
          orLabel.style.cssText = 'text-align:center;font-weight:700;font-family:Montserrat,sans-serif;font-size:0.75rem;color:#888;padding:0;margin:0;line-height:1;';
          orLabel.textContent = 'OR';

          var mobileCell = document.createElement('div');
          mobileCell.className = 'mdc-layout-grid__cell mdc-layout-grid__cell--span-12-desktop mdc-layout-grid__cell--span-8-tablet mdc-text-field mdc-text-field--no-label';
          var mobileInput = document.createElement('input');
          mobileInput.type = 'tel';
          mobileInput.className = 'mdc-text-field__input';
          mobileInput.name = 'contact_mobile';
          mobileInput.placeholder = 'Mobile number';
          mobileInput.setAttribute('aria-label', 'Mobile number');
          mobileCell.appendChild(mobileInput);

          var parent = emailCell.parentNode;
          parent.insertBefore(orLabel, emailCell.nextSibling);
          parent.insertBefore(mobileCell, orLabel.nextSibling);
        }
      }

      // Hide OTP field if present
      var otpInput = form.querySelector('input[placeholder*="OTP" i]');
      if (otpInput) {
        var otpCell = otpInput.closest('.mdc-layout-grid__cell, .mdc-text-field');
        if (otpCell) otpCell.style.display = 'none';
      }

      btn.addEventListener('click', function(e) {
        e.preventDefault();
        submitForm(form);
      });

      setupButtonToggle(form);
    });
  });
})();

// Rearrange contact form layout:
// Desktop: Row1=[Email OR Mobile]  Row2=[Name, Subject]  Row3=[Message]
// Mobile:  Email / OR / Mobile / Name / Subject / Message (stacked)
(function() {
  document.addEventListener('DOMContentLoaded', function() {
    var contactSection = document.querySelector('.contact-us');
    if (!contactSection) return;

    var emailInput = contactSection.querySelector('input[name="email"]');
    var nameInput = contactSection.querySelector('input[name="name"]');
    var subjectInput = contactSection.querySelector('input[name="subject"]');
    var otpInput = contactSection.querySelector('input[name="otp"]');
    var textarea = contactSection.querySelector('textarea');
    if (!emailInput || !nameInput) return;

    // Hide OTP
    if (otpInput) {
      var otpCell = otpInput.closest('.mdc-layout-grid__cell, .mdc-form-field');
      if (otpCell) otpCell.style.display = 'none';
    }

    // Get existing cells
    var emailCell = emailInput.closest('.mdc-layout-grid__cell, .mdc-form-field');
    var nameCell = nameInput.closest('.mdc-layout-grid__cell, .mdc-form-field');
    var subjectCell = subjectInput ? subjectInput.closest('.mdc-layout-grid__cell, .mdc-form-field') : null;
    var textareaCell = textarea ? textarea.closest('.mdc-layout-grid__cell, .mdc-form-field') : null;

    // Build new layout
    var wrapper = document.createElement('div');
    wrapper.style.cssText = 'width:100%;';

    // Row 1: Email | OR | Mobile
    var row1 = document.createElement('div');
    row1.className = 'contact-form-row cf-row-email';
    row1.style.cssText = 'display:flex;align-items:flex-end;gap:0.75rem;margin-bottom:1rem;';

    // Email wrapper
    var emailWrap = document.createElement('div');
    emailWrap.style.cssText = 'flex:1;min-width:8rem;';
    var emailField = document.createElement('div');
    emailField.className = 'mdc-text-field mdc-text-field--no-label';
    emailField.style.width = '100%';
    var newEmail = document.createElement('input');
    newEmail.type = 'email';
    newEmail.className = 'mdc-text-field__input';
    newEmail.name = 'email';
    newEmail.placeholder = 'Email';
    newEmail.value = emailInput.value;
    var emailRipple = document.createElement('div');
    emailRipple.className = 'mdc-line-ripple';
    emailField.appendChild(newEmail);
    emailField.appendChild(emailRipple);
    emailWrap.appendChild(emailField);

    // OR label
    var orSpan = document.createElement('span');
    orSpan.textContent = 'OR';
    orSpan.style.cssText = 'font-weight:700;font-family:Montserrat,sans-serif;font-size:0.875rem;color:#888;padding-bottom:0.4rem;flex-shrink:0;';

    // Mobile wrapper
    var mobileWrap = document.createElement('div');
    mobileWrap.style.cssText = 'flex:1;min-width:8rem;';
    var mobileField = document.createElement('div');
    mobileField.className = 'mdc-text-field mdc-text-field--no-label';
    mobileField.style.width = '100%';
    var mobileInput = document.createElement('input');
    mobileInput.type = 'tel';
    mobileInput.className = 'mdc-text-field__input';
    mobileInput.name = 'contact_mobile';
    mobileInput.placeholder = 'Mobile number';
    var mobileRipple = document.createElement('div');
    mobileRipple.className = 'mdc-line-ripple';
    mobileField.appendChild(mobileInput);
    mobileField.appendChild(mobileRipple);
    mobileWrap.appendChild(mobileField);

    row1.appendChild(emailWrap);
    row1.appendChild(orSpan);
    row1.appendChild(mobileWrap);

    // Row 2: Name | Subject
    var row2 = document.createElement('div');
    row2.className = 'contact-form-row cf-row-name';
    row2.style.cssText = 'display:flex;gap:0.75rem;margin-bottom:1rem;';

    var nameWrap = document.createElement('div');
    nameWrap.style.cssText = 'flex:1;min-width:8rem;';
    var nameField = document.createElement('div');
    nameField.className = 'mdc-text-field mdc-text-field--no-label';
    nameField.style.width = '100%';
    var newName = document.createElement('input');
    newName.type = 'text';
    newName.className = 'mdc-text-field__input';
    newName.name = 'name';
    newName.placeholder = 'Name';
    newName.value = nameInput.value;
    var nameRipple = document.createElement('div');
    nameRipple.className = 'mdc-line-ripple';
    nameField.appendChild(newName);
    nameField.appendChild(nameRipple);
    nameWrap.appendChild(nameField);

    var subjectWrap = document.createElement('div');
    subjectWrap.style.cssText = 'flex:1;min-width:8rem;';
    var subjectField = document.createElement('div');
    subjectField.className = 'mdc-text-field mdc-text-field--no-label';
    subjectField.style.width = '100%';
    var newSubject = document.createElement('input');
    newSubject.type = 'text';
    newSubject.className = 'mdc-text-field__input';
    newSubject.name = 'subject';
    newSubject.placeholder = 'Subject (Optional)';
    if (subjectInput) newSubject.value = subjectInput.value;
    var subjectRipple = document.createElement('div');
    subjectRipple.className = 'mdc-line-ripple';
    subjectField.appendChild(newSubject);
    subjectField.appendChild(subjectRipple);
    subjectWrap.appendChild(subjectField);

    row2.appendChild(nameWrap);
    row2.appendChild(subjectWrap);

    // Row 3: Message
    var row3 = document.createElement('div');
    row3.className = 'contact-form-row';
    row3.style.cssText = 'margin-bottom:1rem;';

    var msgField = document.createElement('div');
    msgField.className = 'mdc-text-field mdc-text-field--textarea mdc-text-field--no-label';
    msgField.style.width = '100%';
    var newTextarea = document.createElement('textarea');
    newTextarea.className = 'mdc-text-field__input';
    newTextarea.name = 'message';
    newTextarea.rows = 4;
    newTextarea.placeholder = 'Add your message';
    if (textarea) newTextarea.value = textarea.value;
    var msgRipple = document.createElement('div');
    msgRipple.className = 'mdc-line-ripple';
    msgField.appendChild(newTextarea);
    msgField.appendChild(msgRipple);
    row3.appendChild(msgField);

    // Honeypot
    var honeypot = document.createElement('input');
    honeypot.type = 'text';
    honeypot.name = '_gotcha';
    honeypot.style.display = 'none';
    honeypot.tabIndex = -1;
    honeypot.autocomplete = 'off';

    wrapper.appendChild(row1);
    wrapper.appendChild(row2);
    wrapper.appendChild(row3);
    wrapper.appendChild(honeypot);

    // Hide all original field cells
    [emailCell, nameCell, subjectCell, textareaCell].forEach(function(cell) {
      if (cell) cell.style.display = 'none';
    });

    // Find the SEND MESSAGE button
    var sendBtn = null;
    contactSection.querySelectorAll('.mdc-button__label').forEach(function(label) {
      if (label.textContent.trim() === 'SEND MESSAGE') sendBtn = label.closest('button');
    });

    // Insert our new layout right before the SEND MESSAGE button
    if (sendBtn) {
      sendBtn.parentNode.insertBefore(wrapper, sendBtn);
    }
  });
})();
